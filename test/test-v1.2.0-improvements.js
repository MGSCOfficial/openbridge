import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Aislamiento obligatorio ANTES de cargar la config: sin esto la suite escribe
// en ~/.openbridge real y reescribe el historial de producción.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbridge-v120-'));
process.env.OPENBRIDGE_DATA_DIR = dataDir;

const { CONFIG } = await import('../src/config.js');
const {
  getNextFallbackModel,
  recordModelFailure,
  recordModelSuccess,
  isModelInCooldown,
  getModelHealthMap
} = await import('../src/client.js');
const { jobManager } = await import('../src/job-manager.js');
const { startDashboardServer, stopDashboardServer } = await import('../src/dashboard.js');

console.log('=== TEST SUITE: MEJORAS ARQUITECTÓNICAS OPENBRIDGE v1.2.1 ===\n');
console.log(`dataDir aislado: ${dataDir}\n`);

const TEST_PORT = 4123;

async function testCircuitBreaker() {
  console.log('[TEST 1] Circuit Breaker & Cooldown Proactivo...');
  const testModel = 'opencode/nemotron-3.5-lightning-free';

  recordModelSuccess(testModel);
  assert.strictEqual(isModelInCooldown(testModel), false, 'El modelo debe iniciar sin cooldown');

  recordModelFailure(testModel, true);
  assert.strictEqual(isModelInCooldown(testModel), false, '1 fallo no debe activar cooldown');

  recordModelFailure(testModel, true);
  assert.strictEqual(isModelInCooldown(testModel), true, '2 fallos deben activar cooldown');

  const nextHealthy = getNextFallbackModel(testModel);
  assert.notStrictEqual(nextHealthy, testModel, 'getNextFallbackModel no debe retornar el modelo en cooldown');
  assert.strictEqual(
    nextHealthy,
    'opencode/nemotron-3.5-super-vl-free',
    'Debe saltar directamente al siguiente modelo sano'
  );

  const health = getModelHealthMap();
  assert.ok(health[testModel].inCooldown, 'El mapa de salud debe reflejar inCooldown: true');
  assert.ok(health[testModel].cooldownRemainingMs > 0, 'Debe tener tiempo de cooldown restante');

  // Regresión: `waitForCompletion` devuelve el id sin proveedor. El éxito debe
  // limpiar el cooldown de la entrada real de la cadena, no de una clave fantasma.
  recordModelSuccess('nemotron-3.5-lightning-free');
  assert.strictEqual(
    isModelInCooldown(testModel),
    false,
    'Un éxito reportado sin prefijo de proveedor debe limpiar el cooldown del modelo de la cadena'
  );

  recordModelFailure(testModel, true);
  recordModelFailure(testModel, true);
  recordModelSuccess(testModel);
  assert.strictEqual(isModelInCooldown(testModel), false, 'Éxito debe resetear el cooldown');

  console.log('  ✅ Circuit Breaker PASS: umbral, cooldown, desvío proactivo y reset por éxito certificados.');
}

async function testPayloadSegregation() {
  console.log('\n[TEST 2] Segregación de Payloads, TTL y escritura única...');
  const testJobId = `job_test_segregation_${Date.now()}`;
  const largeResult = 'X'.repeat(5000);
  const largePrompt = 'Instrucción extensa '.repeat(50);

  jobManager.jobs.set(testJobId, {
    jobId: testJobId,
    sessionID: 'ses_mock_seg',
    model: 'opencode/nemotron-3.5-lightning-free',
    task: 'Tarea de segregación',
    promptText: largePrompt,
    result: largeResult,
    diffs: [{ path: 'test.js', patch: 'diff...' }],
    status: 'COMPLETED',
    startedAt: Date.now() - 2000,
    completedAt: Date.now(),
    durationSeconds: 2,
    outcome: 'succeeded',
    tokens: { input: 10, output: 20, reasoning: 5 }
  });
  jobManager._saveJobs();

  const payloadFile = path.join(CONFIG.payloadsDir, `${testJobId}.json`);
  assert.ok(fs.existsSync(payloadFile), `El archivo de payload ${payloadFile} debe existir`);
  const payloadData = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
  assert.strictEqual(payloadData.result, largeResult, 'El payload en disco debe preservar el resultado íntegro');

  const jobsFileContent = fs.readFileSync(CONFIG.jobsFile, 'utf8');
  assert.ok(!jobsFileContent.includes(largeResult), 'jobs.jsonl debe estar segregado y no contener payloads gigantes');

  const loadedJob = jobManager.getJob(testJobId);
  assert.strictEqual(loadedJob.response, largeResult, 'getJob debe cargar el resultado íntegro desde el payload');
  assert.strictEqual(loadedJob.diffsCount, 1, 'getJob debe reportar diffsCount correctamente');

  // Regresión: el guardado repetido no debe reescribir el payload de cada job.
  const savedAtBefore = payloadData.savedAt;
  await new Promise((r) => setTimeout(r, 15));
  jobManager._saveJobs();
  const savedAtAfter = JSON.parse(fs.readFileSync(payloadFile, 'utf8')).savedAt;
  assert.strictEqual(savedAtAfter, savedAtBefore, 'Un guardado sin cambios no debe reescribir el payload');

  // Persistencia real: simular proceso nuevo.
  jobManager.jobs.clear();
  jobManager._loadJobs();
  const afterRestart = jobManager.getJob(testJobId);
  assert.strictEqual(afterRestart.response, largeResult, 'El resultado debe sobrevivir a un reinicio');
  assert.strictEqual(
    jobManager.jobs.get(testJobId).promptText,
    largePrompt,
    'El prompt íntegro debe seguir disponible tras el reinicio'
  );

  try {
    fs.unlinkSync(payloadFile);
  } catch {}
  jobManager.jobs.delete(testJobId);
  jobManager._saveJobs();

  console.log('  ✅ Segregación PASS: payload fuera del índice, reconstrucción íntegra y escritura única.');
}

async function testDashboardAuth() {
  console.log('\n[TEST 3] Autenticación y Seguridad del Dashboard Local...');
  CONFIG.dashboardAuthEnabled = true;

  startDashboardServer(TEST_PORT);
  await new Promise((r) => setTimeout(r, 250));

  try {
    const base = `http://127.0.0.1:${TEST_PORT}`;

    const resNoAuth = await fetch(`${base}/api/status`);
    assert.strictEqual(resNoAuth.status, 401, 'Petición sin token debe retornar 401 Unauthorized');
    assert.strictEqual((await resNoAuth.json()).error, 'Unauthorized');

    const resQueryAuth = await fetch(`${base}/api/status?token=${encodeURIComponent(CONFIG.serverPassword)}`);
    assert.strictEqual(resQueryAuth.status, 200, 'Petición con ?token= debe retornar 200 OK');

    const resHeaderAuth = await fetch(`${base}/api/status`, {
      headers: { Authorization: `Bearer ${CONFIG.serverPassword}` }
    });
    assert.strictEqual(resHeaderAuth.status, 200, 'Petición con Authorization Bearer debe retornar 200 OK');

    const resWrong = await fetch(`${base}/api/status`, { headers: { Authorization: 'Bearer token_falso' } });
    assert.strictEqual(resWrong.status, 401, 'Un Bearer inválido debe rechazarse');

    const resHtmlNoAuth = await fetch(`${base}/`);
    assert.strictEqual(resHtmlNoAuth.status, 401, 'HTML sin auth debe retornar 401 Gateway');
    assert.ok((await resHtmlNoAuth.text()).includes('OpenBridge Console'), 'Debe mostrar el gateway');

    // El token de la query se canjea por cookie y la URL queda limpia.
    const gateway = await fetch(`${base}/?token=${encodeURIComponent(CONFIG.serverPassword)}`, { redirect: 'manual' });
    assert.strictEqual(gateway.status, 302, 'El canje de token debe redirigir a una URL sin token');
    assert.strictEqual(gateway.headers.get('location'), '/');
    const setCookie = gateway.headers.get('set-cookie') || '';
    assert.ok(/HttpOnly/i.test(setCookie), 'La cookie debe ser HttpOnly');
    assert.ok(/SameSite=Strict/i.test(setCookie), 'La cookie debe ser SameSite=Strict');
    const cookie = setCookie.split(';')[0];

    const withCookie = await fetch(`${base}/api/status`, { headers: { Cookie: cookie } });
    assert.strictEqual(withCookie.status, 200, 'La cookie emitida debe autenticar');

    const sse = await fetch(`${base}/api/events`, { headers: { Cookie: cookie } });
    assert.strictEqual(sse.status, 200, 'El stream SSE debe aceptar la cookie');

    // Regresión: un token no hexadecimal (passphrase manual) también debe funcionar.
    const previous = CONFIG.serverPassword;
    CONFIG.serverPassword = 'passphrase local no-hex';
    try {
      const gatewayNonHex = await fetch(
        `${base}/?token=${encodeURIComponent(CONFIG.serverPassword)}`,
        { redirect: 'manual' }
      );
      assert.strictEqual(gatewayNonHex.status, 302, 'Token no-hex debe canjearse igual');
      const cookieNonHex = (gatewayNonHex.headers.get('set-cookie') || '').split(';')[0];
      const withNonHex = await fetch(`${base}/api/status`, { headers: { Cookie: cookieNonHex } });
      assert.strictEqual(withNonHex.status, 200, 'La cookie con token no-hex debe autenticar');
    } finally {
      CONFIG.serverPassword = previous;
    }

    console.log('  ✅ Dashboard Auth PASS: 401, Bearer, cookie, SSE y canje sin token en URL.');
  } finally {
    stopDashboardServer();
  }
}

async function testPluginManifest() {
  console.log('\n[TEST 4] Coherencia de versión y manifiesto de plugin...');
  const root = process.cwd();
  const pluginFile = path.join(root, 'plugin.json');
  assert.ok(fs.existsSync(pluginFile), 'plugin.json debe existir en la raíz');

  const manifest = JSON.parse(fs.readFileSync(pluginFile, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const indexSource = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
  const indexVersion = (indexSource.match(/version:\s*'([^']+)'/) || [])[1];

  assert.strictEqual(manifest.name, 'openbridge');
  assert.ok(manifest.mcpConfig, 'Debe especificar mcpConfig');
  assert.strictEqual(manifest.version, pkg.version, 'plugin.json y package.json deben coincidir');
  assert.strictEqual(indexVersion, pkg.version, 'El McpServer debe reportar la misma versión');

  console.log('  ✅ Plugin Manifest PASS: manifest, package.json e index.js en la misma versión.');
}

async function run() {
  try {
    await testCircuitBreaker();
    await testPayloadSegregation();
    await testDashboardAuth();
    await testPluginManifest();
    console.log('\n🎯 [100% PASS] Mejoras de v1.2.x certificadas sobre datos aislados.');
    process.exitCode = 0;
  } catch (err) {
    console.error('\n❌ ERROR EN TEST v1.2.x:', err);
    process.exitCode = 1;
  } finally {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  }
}

await run();
