import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Aislamiento obligatorio: los tests NUNCA deben escribir en ~/.openbridge real.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbridge-test-'));
process.env.OPENBRIDGE_DATA_DIR = dataDir;

const { CONFIG } = await import('../src/config.js');
const { jobManager } = await import('../src/job-manager.js');
const { client, getNextFallbackModel, isRecoverableModelError } = await import('../src/client.js');
const { TOOLS, registerAllTools } = await import('../src/tools.js');

console.log('=== TEST SUITE: REMEDIACIÓN Y CONTRATOS BASE OPENBRIDGE ===');
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

  const source = fs.readFileSync(new URL('../src/server-manager.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('OPENBRIDGE_ALLOW_LEGACY'), 'el puente legacy debe haber sido retirado');
  const occurrences = (source.match(/openbridge_local_token_2026/g) || []).length;
  assert.strictEqual(occurrences, 0, 'el literal legacy ya no debe existir en server-manager.js');
}

async function testP04RecursionGuard() {
  assert.strictEqual(CONFIG.maxDepth, 2, 'maxDepth por defecto = 2');

  await assert.rejects(
    () => jobManager.startJob({ task: 'nested attempt', call_depth: 1 }),
    /NESTED_DELEGATION_DISABLED/,
    'con allowNested=false, call_depth>0 debe rechazarse'
  );

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
  const longPrompt = 'Prompt íntegro que debe sobrevivir al reinicio sin duplicarse en jobs.jsonl: ' + 'p'.repeat(400);
  jobManager.jobs.clear();
  jobManager.jobs.set(testJobId, {
    jobId: testJobId,
    sessionID: 'ses_mock_999',
    model: 'provider-a/model-alpha',
    task: 'Persistencia determinista JSONL',
    promptText: longPrompt,
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
  const jobsContent = fs.readFileSync(CONFIG.jobsFile, 'utf8');
  const lines = jobsContent.split('\n').filter((l) => l.trim());
  assert.ok(lines.some((l) => l.includes(testJobId)), 'el job debe estar en disco');
  assert.ok(!jobsContent.includes(longPrompt), 'promptText largo NO debe duplicarse en jobs.jsonl');

  jobManager.jobs.clear();
  assert.strictEqual(jobManager.jobs.size, 0);
  jobManager._loadJobs();

  const recovered = jobManager.getJob(testJobId);
  assert.strictEqual(recovered.found, true, 'el job debe recuperarse desde disco');
  assert.strictEqual(recovered.status, 'COMPLETED');
  assert.strictEqual(recovered.response, 'Respuesta persistida');
  assert.strictEqual(
    jobManager._getFullPrompt(jobManager.jobs.get(testJobId)),
    longPrompt,
    'el prompt íntegro debe recuperarse desde payloads/'
  );
}

async function testP02ConfigurableFallbackResend() {
  // Sin cadena configurada: no debe inventar modelos fijos.
  assert.strictEqual(getNextFallbackModel('provider-a/model-1', []), null);

  // Con lista configurable de respaldo: recorre en orden.
  const customChain = ['provider-a/model-1', 'provider-b/model-2', 'provider-c/model-3'];
  assert.strictEqual(getNextFallbackModel('provider-a/model-1', customChain), 'provider-b/model-2');
  assert.strictEqual(getNextFallbackModel('provider-b/model-2', customChain), 'provider-c/model-3');
  assert.strictEqual(getNextFallbackModel('provider-c/model-3', customChain), null);

  assert.ok(isRecoverableModelError('OpenCode API error [429 POST]: Rate limit exceeded'));
  assert.ok(isRecoverableModelError('503 Service Unavailable: Overloaded'));
  assert.ok(isRecoverableModelError('quota exceeded'));
  assert.strictEqual(isRecoverableModelError('SyntaxError: unexpected token'), false);

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
      return { id: 'msg_1', time: { created: Date.now() } };
    };
    client.interruptSession = async () => null;
    client.waitForCompletion = async (sessionID) => ({
      sessionID,
      outcome: 'succeeded',
      model: { providerID: 'provider-b', id: 'model-2' },
      text: 'ok',
      tokens: { input: 1, output: 1, reasoning: 0 },
      cost: null,
      diffs: [],
      durationMs: 1
    });

    const task = 'briefing largo que NO debe truncarse al reenviar: ' + 'x'.repeat(400);
    const started = await jobManager.startJob({
      task,
      model: 'provider-a/model-1',
      fallback_models: customChain
    });
    await new Promise((r) => setTimeout(r, 120));
    const final = jobManager.getJob(started.jobId);

    assert.strictEqual(creates, 2, 'debe crear una segunda sesión tras el 429');
    assert.deepStrictEqual(sends, ['ses_fb_1', 'ses_fb_2'], 'debe reenviar el prompt a la sesión nueva');
    assert.strictEqual(started.sessionID, 'ses_fb_2');
    assert.strictEqual(started.model, 'provider-b/model-2');
    assert.strictEqual(final.status, 'COMPLETED');
    assert.strictEqual(jobManager.jobs.get(started.jobId).promptText, task);
  } finally {
    Object.assign(client, original);
  }
}

async function testToolsUnified() {
  assert.strictEqual(TOOLS.length, 11, 'deben existir exactamente 11 tools del puente');
  assert.strictEqual(typeof registerAllTools, 'function', 'registerAllTools debe exportarse');
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepStrictEqual(names, [
    'openbridge_cancel_task',
    'openbridge_check_task',
    'openbridge_delegate_task',
    'openbridge_get_diff',
    'openbridge_get_messages',
    'openbridge_list_active_tasks',
    'openbridge_list_models',
    'openbridge_list_sessions',
    'openbridge_start_task',
    'openbridge_status',
    'openbridge_usage_stats'
  ]);
  for (const toolName of ['openbridge_delegate_task', 'openbridge_start_task']) {
    const params = TOOLS.find((t) => t.name === toolName).parameters;
    assert.ok(params.call_depth, `${toolName} debe declarar call_depth`);
    assert.ok(params.session_id, `${toolName} debe declarar session_id`);
    assert.ok(params.fallback_models, `${toolName} debe declarar fallback_models`);
  }
}

async function runAll() {
  await test('P03 · token dinámico + legacy gateado', testP03DynamicAuth);
  await test('P04 · guardián de recursión (default-deny)', testP04RecursionGuard);
  await test('P01 · persistencia real con Map limpio', testP01JobPersistence);
  await test('P02 · fallback configurable reenvía prompt', testP02ConfigurableFallbackResend);
  await test('P05 · 10 tools de puente unificadas', testToolsUnified);

  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}

  if (failures > 0) {
    console.error(`\n❌ ${failures} prueba(s) fallaron.`);
    process.exit(1);
  }
  console.log('\n✅ Suite completa: 5/5 PASS.');
  process.exit(0);
}

runAll();
