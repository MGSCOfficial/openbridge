import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { CONFIG } from '../src/config.js';
import {
  FREE_FALLBACK_CHAIN,
  getNextFallbackModel,
  recordModelFailure,
  recordModelSuccess,
  isModelInCooldown,
  getModelHealthMap
} from '../src/client.js';
import { jobManager } from '../src/job-manager.js';
import { startDashboardServer, stopDashboardServer } from '../src/dashboard.js';

console.log('=== TEST SUITE: MEJORAS ARQUITECTÓNICAS OPENBRIDGE v1.2.0 ===\n');

async function testCircuitBreaker() {
  console.log('[TEST 1] Circuit Breaker & Cooldown Proactivo...');
  const testModel = 'opencode/nemotron-3.5-lightning-free';

  // 1. Estado inicial sano
  recordModelSuccess(testModel);
  assert.strictEqual(isModelInCooldown(testModel), false, 'El modelo debe iniciar sin cooldown');

  // 2. Simular primer fallo
  recordModelFailure(testModel, true);
  assert.strictEqual(isModelInCooldown(testModel), false, '1 fallo no debe activar cooldown');

  // 3. Simular segundo fallo (umbral alcanzado)
  recordModelFailure(testModel, true);
  assert.strictEqual(isModelInCooldown(testModel), true, '2 fallos deben activar cooldown');

  // 4. Salto proactivo de modelo en cooldown
  const nextHealthy = getNextFallbackModel(testModel);
  assert.notStrictEqual(nextHealthy, testModel, 'getNextFallbackModel no debe retornar el modelo en cooldown');
  assert.strictEqual(
    nextHealthy,
    'opencode/nemotron-3.5-super-vl-free',
    'Debe saltar directamente al siguiente modelo sano'
  );

  // 5. Ver mapa de salud
  const health = getModelHealthMap();
  assert.ok(health[testModel].inCooldown, 'El mapa de salud debe reflejar inCooldown: true');
  assert.ok(health[testModel].cooldownRemainingMs > 0, 'Debe tener tiempo de cooldown restante');

  // 6. Reset tras éxito
  recordModelSuccess(testModel);
  assert.strictEqual(isModelInCooldown(testModel), false, 'Éxito debe resetear el cooldown');
  console.log('  ✅ Circuit Breaker PASS: Detección de fallos, activación de cooldown y desvío proactivo certificados.');
}

async function testPayloadSegregation() {
  console.log('\n[TEST 2] Segregación de Payloads y TTL...');
  const testJobId = `job_test_segregation_${Date.now()}`;
  const largeResult = 'X'.repeat(5000); // 5KB de resultado
  const largePrompt = 'Instrucción extensa '.repeat(50);

  const testJob = {
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
  };

  jobManager.jobs.set(testJobId, testJob);
  jobManager._saveJobs();

  // 1. Validar que el archivo individual de payload existe en CONFIG.payloadsDir
  const payloadFile = path.join(CONFIG.payloadsDir, `${testJobId}.json`);
  assert.ok(fs.existsSync(payloadFile), `El archivo de payload ${payloadFile} debe existir`);
  const payloadData = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
  assert.strictEqual(payloadData.result, largeResult, 'El payload en disco debe preservar el resultado íntegro');

  // 2. Validar que jobs.jsonl NO contiene el string gigante de 5KB (solo preview)
  const jobsFileContent = fs.readFileSync(CONFIG.jobsFile, 'utf8');
  assert.ok(!jobsFileContent.includes(largeResult), 'jobs.jsonl debe estar segregado y no contener payloads gigantes');

  // 3. Validar reconstrucción íntegra en getJob
  const loadedJob = jobManager.getJob(testJobId);
  assert.strictEqual(loadedJob.response, largeResult, 'getJob debe cargar el resultado íntegro desde el payload');
  assert.strictEqual(loadedJob.diffsCount, 1, 'getJob debe reportar diffsCount correctamente');

  // Limpieza de prueba
  try {
    fs.unlinkSync(payloadFile);
  } catch {}
  jobManager.jobs.delete(testJobId);
  jobManager._saveJobs();

  console.log('  ✅ Segregación PASS: Payload persistido en disco fuera de jobs.jsonl y recuperado con éxito.');
}

async function testDashboardAuth() {
  console.log('\n[TEST 3] Autenticación y Seguridad del Dashboard Local...');
  const testPort = 4099;
  startDashboardServer(testPort);

  try {
    // 1. Petición no autenticada a /api/status -> debe ser 401
    const resNoAuth = await fetch(`http://127.0.0.1:${testPort}/api/status`);
    assert.strictEqual(resNoAuth.status, 401, 'Petición sin token debe retornar 401 Unauthorized');
    const jsonNoAuth = await resNoAuth.json();
    assert.strictEqual(jsonNoAuth.error, 'Unauthorized');

    // 2. Petición con query param ?token=<serverPassword> -> debe ser 200 OK
    const resQueryAuth = await fetch(`http://127.0.0.1:${testPort}/api/status?token=${CONFIG.serverPassword}`);
    assert.strictEqual(resQueryAuth.status, 200, 'Petición con ?token= debe retornar 200 OK');
    const jsonQuery = await resQueryAuth.json();
    assert.strictEqual(jsonQuery.status, 'ONLINE');

    // 3. Petición con Header Authorization: Bearer <serverPassword> -> debe ser 200 OK
    const resHeaderAuth = await fetch(`http://127.0.0.1:${testPort}/api/status`, {
      headers: { Authorization: `Bearer ${CONFIG.serverPassword}` }
    });
    assert.strictEqual(resHeaderAuth.status, 200, 'Petición con Authorization Bearer debe retornar 200 OK');

    // 4. Petición web a / sin auth -> debe devolver 401 con formulario gateway
    const resHtmlNoAuth = await fetch(`http://127.0.0.1:${testPort}/`);
    assert.strictEqual(resHtmlNoAuth.status, 401, 'HTML sin auth debe retornar 401 Gateway');
    const htmlText = await resHtmlNoAuth.text();
    assert.ok(htmlText.includes('OpenBridge Console'), 'Debe mostrar la página de acceso protegido');

    console.log('  ✅ Dashboard Auth PASS: Protección de API y Gateway HTML verificados.');
  } finally {
    stopDashboardServer();
  }
}

async function testPluginManifest() {
  console.log('\n[TEST 4] Validación de Manifiesto de Plugin Antigravity...');
  const pluginFile = path.join(process.cwd(), 'plugin.json');
  assert.ok(fs.existsSync(pluginFile), 'plugin.json debe existir en la raíz');
  const manifest = JSON.parse(fs.readFileSync(pluginFile, 'utf8'));
  assert.strictEqual(manifest.name, 'openbridge');
  assert.strictEqual(manifest.version, '1.2.0');
  assert.ok(manifest.mcpConfig, 'Debe especificar mcpConfig');
  console.log('  ✅ Plugin Manifest PASS: plugin.json conforme a la especificación de Antigravity.');
}

async function run() {
  try {
    await testCircuitBreaker();
    await testPayloadSegregation();
    await testDashboardAuth();
    await testPluginManifest();
    console.log('\n🎯 [100% PASS] Todas las mejoras arquitectónicas de v1.2.0 certificadas con éxito.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR EN TEST v1.2.0:', err);
    process.exit(1);
  }
}

run();
