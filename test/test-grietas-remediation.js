import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Aislamiento obligatorio: los tests NUNCA deben escribir en ~/.openbridge real.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbridge-test-'));
process.env.OPENBRIDGE_DATA_DIR = dataDir;

const { CONFIG } = await import('../src/config.js');
const { jobManager } = await import('../src/job-manager.js');
const { client, FREE_FALLBACK_CHAIN, getNextFallbackModel, isRecoverableModelError } = await import(
  '../src/client.js'
);
const { TOOLS, registerAllTools } = await import('../src/tools.js');

console.log('=== TEST SUITE: REMEDIACIÓN DE GRIETAS OPENBRIDGE (v1.1.0-beta.2) ===');
console.log(`dataDir aislado: ${dataDir}`);

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name} PASS`);
  } catch (err) {
    failures += 1;
    console.error(`  ❌ ${name} FAIL: ${err.message}`);
  }
}

async function testP03DynamicAuth() {
  assert.ok(CONFIG.serverPassword, 'serverPassword no debe estar vacío');
  assert.notStrictEqual(CONFIG.serverPassword, 'openbridge_local_token_2026', 'no debe ser el token estático');
  assert.ok(CONFIG.serverPassword.length >= 32, 'el token debe tener entropía suficiente (>=32 chars)');

  const tokenFile = path.join(CONFIG.dataDir, 'token');
  assert.ok(fs.existsSync(tokenFile), 'el archivo token debe existir');
  assert.strictEqual(fs.readFileSync(tokenFile, 'utf8').trim(), CONFIG.serverPassword);

  // Regresión: el literal legacy solo puede aparecer una vez (constante) y debe
  // estar gobernado por OPENBRIDGE_ALLOW_LEGACY.
  const source = fs.readFileSync(new URL('../src/server-manager.js', import.meta.url), 'utf8');
  assert.ok(source.includes('OPENBRIDGE_ALLOW_LEGACY'), 'la ruta legacy debe estar gateada por env');
  const occurrences = (source.match(/openbridge_local_token_2026/g) || []).length;
  assert.ok(occurrences <= 1, `el literal legacy aparece ${occurrences} veces; debe ser 1 (constante)`);
}

async function testP04RecursionGuard() {
  assert.strictEqual(CONFIG.maxDepth, 2, 'maxDepth por defecto = 2');

  // Default-deny: un worker no puede abrir una delegación anidada.
  await assert.rejects(
    () => jobManager.startJob({ task: 'nested attempt', call_depth: 1 }),
    /NESTED_DELEGATION_DISABLED/,
    'con allowNested=false, call_depth>0 debe rechazarse'
  );

  // Con nesting habilitado, el techo maxDepth sigue vigente.
  const previous = CONFIG.allowNested;
  CONFIG.allowNested = true;
  try {
    await assert.rejects(
      () => jobManager.startJob({ task: 'too deep', call_depth: 2 }),
      /RECURSION_LIMIT_EXCEEDED/,
      'call_depth >= maxDepth debe rechazarse'
    );
  } finally {
    CONFIG.allowNested = previous;
  }
}

async function testP01JobPersistence() {
  const testJobId = `job_test_persist_${Date.now()}`;
  jobManager.jobs.clear();
  jobManager.jobs.set(testJobId, {
    jobId: testJobId,
    sessionID: 'ses_mock_999',
    model: 'opencode/nemotron-3.5-lightning-free',
    task: 'Persistencia determinista JSONL',
    promptText: 'Prompt íntegro que debe sobrevivir al reinicio',
    status: 'COMPLETED',
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    durationSeconds: 5,
    outcome: 'succeeded',
    tokens: { input: 100, output: 50, reasoning: 10 },
    diffs: [],
    result: 'Respuesta persistida'
  });
  jobManager._saveJobs();

  assert.ok(fs.existsSync(CONFIG.jobsFile), 'jobs.jsonl debe existir');
  const lines = fs.readFileSync(CONFIG.jobsFile, 'utf8').split('\n').filter((l) => l.trim());
  assert.ok(lines.some((l) => l.includes(testJobId)), 'el job debe estar en disco');

  // Simular un proceso nuevo: sin esto, el test pasaría aunque _loadJobs no leyera nada.
  jobManager.jobs.clear();
  assert.strictEqual(jobManager.jobs.size, 0);
  jobManager._loadJobs();

  const recovered = jobManager.getJob(testJobId);
  assert.strictEqual(recovered.found, true, 'el job debe recuperarse desde disco');
  assert.strictEqual(recovered.status, 'COMPLETED');
  assert.strictEqual(recovered.response, 'Respuesta persistida');
  assert.strictEqual(
    jobManager.jobs.get(testJobId).promptText,
    'Prompt íntegro que debe sobrevivir al reinicio',
    'el prompt íntegro debe persistirse (no el preview de 100 chars)'
  );
}

async function testP02FallbackResend() {
  // Funciones puras
  assert.strictEqual(getNextFallbackModel('opencode/nemotron-3.5-lightning-free'), 'opencode/nemotron-3.5-super-vl-free');
  assert.strictEqual(getNextFallbackModel('opencode/nemotron-3.5-super-vl-free'), 'opencode/deepseek-v4.1-flash-free');
  assert.strictEqual(getNextFallbackModel('opencode/deepseek-v4.1-flash-free'), 'opencode/glm-5.3-flash-free');
  assert.strictEqual(getNextFallbackModel('opencode/glm-5.3-flash-free'), null);
  assert.ok(isRecoverableModelError('OpenCode API error [429 POST]: Rate limit exceeded'));
  assert.ok(isRecoverableModelError('503 Service Unavailable: Overloaded'));
  assert.ok(isRecoverableModelError('quota exceeded for free model'));
  assert.strictEqual(isRecoverableModelError('SyntaxError: unexpected token'), false);

  // Integración: createSession OK + sendPrompt 429 debe crear OTRA sesión y reenviar.
  const original = {
    createSession: client.createSession,
    sendPrompt: client.sendPrompt,
    waitForCompletion: client.waitForCompletion,
    interruptSession: client.interruptSession
  };
  let creates = 0;
  const sends = [];
  try {
    client.createSession = async () => {
      creates += 1;
      return `ses_fb_${creates}`;
    };
    client.sendPrompt = async (sessionID) => {
      sends.push(sessionID);
      if (sends.length === 1) {
        throw new Error('OpenCode API error [429 POST /api/session/x/prompt]: Rate limit exceeded');
      }
    };
    client.interruptSession = async () => null;
    client.waitForCompletion = async (sessionID) => ({
      sessionID,
      outcome: 'succeeded',
      model: { id: 'mock-model' },
      text: 'ok',
      tokens: { input: 1, output: 1, reasoning: 0 },
      diffs: [],
      durationMs: 1
    });

    const task = 'briefing largo que NO debe truncarse al reenviar: ' + 'x'.repeat(400);
    const started = await jobManager.startJob({ task, model: 'opencode/nemotron-3.5-lightning-free' });
    await new Promise((r) => setTimeout(r, 120));
    const final = jobManager.getJob(started.jobId);

    assert.strictEqual(creates, 2, 'debe crear una segunda sesión tras el 429');
    assert.deepStrictEqual(sends, ['ses_fb_1', 'ses_fb_2'], 'debe reenviar el prompt a la sesión nueva');
    assert.strictEqual(started.sessionID, 'ses_fb_2', 'el job debe apuntar a la sesión que sí recibió el prompt');
    assert.strictEqual(started.model, 'opencode/nemotron-3.5-super-vl-free', 'debe reportar el modelo de fallback');
    assert.strictEqual(final.status, 'COMPLETED');
    assert.strictEqual(jobManager.jobs.get(started.jobId).promptText, task, 'el prompt íntegro debe persistirse');
  } finally {
    Object.assign(client, original);
  }
}

async function testToolsUnified() {
  assert.strictEqual(TOOLS.length, 8, 'deben existir exactamente 8 tools');
  assert.strictEqual(typeof registerAllTools, 'function', 'registerAllTools debe exportarse');
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepStrictEqual(names, [
    'openbridge_cancel_task',
    'openbridge_check_task',
    'openbridge_delegate_task',
    'openbridge_get_diff',
    'openbridge_list_active_tasks',
    'openbridge_list_models',
    'openbridge_start_task',
    'openbridge_status'
  ]);
  for (const toolName of ['openbridge_delegate_task', 'openbridge_start_task']) {
    assert.ok(TOOLS.find((t) => t.name === toolName).parameters.call_depth, `${toolName} debe declarar call_depth`);
  }
}

async function runAll() {
  await test('P03 · token dinámico + legacy gateado', testP03DynamicAuth);
  await test('P04 · guardián de recursión (default-deny)', testP04RecursionGuard);
  await test('P01 · persistencia real con Map limpio', testP01JobPersistence);
  await test('P02 · fallback reenvía prompt (integración)', testP02FallbackResend);
  await test('P05 · 8 tools unificadas', testToolsUnified);

  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}

  if (failures > 0) {
    console.error(`\n❌ ${failures} prueba(s) fallaron. La suite NO certifica nada que no haya ejecutado.`);
    process.exit(1);
  }
  console.log('\n✅ Suite completa: 5/5. Certifica persistencia real, fallback con reenvío, default-deny de recursión y token dinámico.');
  process.exit(0);
}

runAll();
