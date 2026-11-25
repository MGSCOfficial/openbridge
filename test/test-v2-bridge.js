import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Aislamiento obligatorio antes de importar configuración
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbridge-v2-'));
process.env.OPENBRIDGE_DATA_DIR = dataDir;

const { CONFIG } = await import('../src/config.js');
const {
  client,
  getNextFallbackModel,
  recordModelFailure,
  recordModelSuccess,
  isModelInCooldown,
  getModelHealthMap,
  clearModelHealth
} = await import('../src/client.js');
const { jobManager } = await import('../src/job-manager.js');

console.log('=== TEST SUITE: PUENTE DESCENTRALIZADO OPENBRIDGE v2.0.0 ===\n');
console.log(`dataDir aislado: ${dataDir}\n`);

async function testDecentralizedModelParsingAndListing() {
  console.log('[TEST 1] Descubrimiento multi-proveedor y parseo universal...');
  const origRequest = client.request;
  const capturedBodies = [];

  try {
    client.request = async (reqPath, opts = {}) => {
      if (reqPath === '/api/model') {
        return [
          { id: 'deepseek-v4.1-flash-free', providerID: 'opencode', name: 'DeepSeek V4.1', cost: { input: 0, output: 0 } },
          { id: 'anthropic/claude-sonnet-5', providerID: 'openrouter', name: 'Claude Sonnet 5', cost: { input: 3, output: 15 } },
          { id: 'qwen3:32b', providerID: 'ollama', name: 'Qwen3 Local' }
        ];
      }
      if (reqPath === '/api/session' && opts.method === 'POST') {
        capturedBodies.push(JSON.parse(opts.body));
        return { id: `ses_mock_${capturedBodies.length}` };
      }
      return [];
    };

    const allModels = await client.listModels();
    assert.strictEqual(allModels.length, 3, 'free_only=false por defecto debe mostrar todos los proveedores');
    assert.strictEqual(allModels[1].fullId, 'openrouter/anthropic/claude-sonnet-5');
    assert.strictEqual(allModels[1].isFree, false);

    const ollamaModels = await client.listModels({ provider: 'ollama' });
    assert.strictEqual(ollamaModels.length, 1, 'Debe filtrar cualquier proveedor arbitrario como ollama');
    assert.strictEqual(ollamaModels[0].fullId, 'ollama/qwen3:32b');

    await client.createSession({ model: 'openrouter/anthropic/claude-sonnet-5' });
    await client.createSession({ model: 'ollama/qwen3:32b' });
    await client.createSession({ model: null });

    assert.deepStrictEqual(capturedBodies[0].model, { providerID: 'openrouter', id: 'anthropic/claude-sonnet-5' });
    assert.deepStrictEqual(capturedBodies[1].model, { providerID: 'ollama', id: 'qwen3:32b' });
    assert.strictEqual(capturedBodies[2].model, undefined, 'Sin modelo especificado, OpenCode elige el suyo por defecto');
    console.log('  ✅ Multi-proveedor y parseo universal PASS.');
  } finally {
    client.request = origRequest;
  }
}

async function testDynamicCircuitBreaker() {
  console.log('\n[TEST 2] Circuit Breaker dinámico (sin lista hardcoded)...');
  clearModelHealth();
  const chain = ['ollama/model-1', 'anthropic/model-2', 'opencode/deepseek-v4.1-flash-free'];

  assert.strictEqual(CONFIG.defaultModel, null, 'defaultModel no debe imponer un modelo hardcoded');
  assert.strictEqual(getNextFallbackModel('ollama/model-1', []), null, 'Sin fallback configurado debe devolver null');

  recordModelFailure('ollama/model-1', true, chain);
  assert.strictEqual(isModelInCooldown('ollama/model-1'), false);
  recordModelFailure('ollama/model-1', true, chain);
  assert.strictEqual(isModelInCooldown('ollama/model-1'), true);

  assert.strictEqual(getNextFallbackModel('any/primary', chain), 'anthropic/model-2');
  const health = getModelHealthMap();
  assert.ok(health['ollama/model-1'].inCooldown);

  // Normalización proveedor/modelo: éxito reportado sin prefijo limpia el cooldown real
  recordModelSuccess('model-1', chain);
  assert.strictEqual(isModelInCooldown('ollama/model-1'), false);
  console.log('  ✅ Circuit Breaker dinámico PASS.');
}

async function testMultiTurnAndSessionReading() {
  console.log('\n[TEST 3] Continuidad multi-turno (session_id) y lectura de mensajes...');
  const orig = {
    sendPrompt: client.sendPrompt,
    waitForCompletion: client.waitForCompletion,
    request: client.request,
    getSessionMessages: client.getSessionMessages
  };
  let createCalled = false;
  let capturedWaitAfter = null;

  try {
    client.createSession = async () => {
      createCalled = true;
      return 'ses_should_not_be_created';
    };
    client.sendPrompt = async (sid, text) => ({
      id: 'msg_u2',
      sessionID: sid,
      time: { created: 2000 },
      payload: { text }
    });
    client.waitForCompletion = async (sid, _timeout, afterTs) => {
      capturedWaitAfter = afterTs;
      return {
        sessionID: sid,
        outcome: 'succeeded',
        model: { providerID: 'opencode', id: 'deepseek-v4.1-flash-free' },
        text: 'Respuesta del turno 2',
        tokens: { input: 20, output: 10, reasoning: 0 },
        cost: 0.001,
        diffs: [],
        durationMs: 15
      };
    };

    const started = await jobManager.startJob({
      task: 'Pregunta de seguimiento',
      session_id: 'ses_existing_123'
    });
    assert.strictEqual(createCalled, false, 'Con session_id no debe crear sesión nueva');
    assert.strictEqual(started.resumedSession, true);
    assert.strictEqual(started.sessionID, 'ses_existing_123');
    assert.strictEqual(capturedWaitAfter, 2000, 'Debe pasar timestamp del prompt al waitForCompletion');

    await new Promise((r) => setTimeout(r, 60));
    const job = jobManager.getJob(started.jobId);
    assert.strictEqual(job.status, 'COMPLETED');
    assert.strictEqual(job.cost, 0.001);
    assert.strictEqual(job.response, 'Respuesta del turno 2');

    // Probar listSessions y readSessionMessages
    client.request = async (reqPath) => {
      if (reqPath === '/api/session') {
        return [
          { id: 'ses_old', title: 'Vieja', time: { created: 1000, idle: 1100 } },
          { id: 'ses_new', title: 'Nueva', model: { providerID: 'opencode', id: 'deepseek-v4.1-flash-free' }, time: { created: 2000, updated: 3000, idle: 3000 } }
        ];
      }
      if (reqPath === '/api/session/ses_new') {
        return { id: 'ses_new', title: 'Nueva', model: { providerID: 'opencode', id: 'deepseek-v4.1-flash-free' } };
      }
      return [];
    };
    client.getSessionMessages = async () => [
      { id: 'm1', type: 'user', time: { created: 2000 }, payload: { text: 'Hola' } },
      { id: 'm2', type: 'assistant', time: { created: 2500 }, content: [{ type: 'reasoning', text: 'Pensando...' }, { type: 'text', text: 'Hola humano' }] }
    ];

    const sessions = await client.listSessions(10);
    assert.strictEqual(sessions[0].id, 'ses_new', 'Debe ordenar por más reciente primero');

    const transcript = await client.readSessionMessages('ses_new', { includeReasoning: true });
    assert.strictEqual(transcript.totalMessages, 2);
    assert.strictEqual(transcript.messages[1].text, 'Hola humano');
    assert.strictEqual(transcript.messages[1].reasoning, 'Pensando...');
    console.log('  ✅ Continuidad multi-turno y lectura de sesiones PASS.');
  } finally {
    Object.assign(client, orig);
  }
}

async function testPayloadSegregationAndManifest() {
  console.log('\n[TEST 4] Segregación de payloads y manifiesto v2.0.0...');
  const testJobId = `job_test_seg_${Date.now()}`;
  const largeResult = 'Z'.repeat(2000);

  jobManager.jobs.set(testJobId, {
    jobId: testJobId,
    sessionID: 'ses_seg',
    model: 'opencode/deepseek-v4.1-flash-free',
    task: 'Segregación v2',
    promptText: 'Prompt completo',
    result: largeResult,
    diffs: [{ path: 'a.js' }],
    status: 'COMPLETED',
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    durationSeconds: 1,
    outcome: 'succeeded',
    tokens: { input: 5, output: 15, reasoning: 0 }
  });
  jobManager._saveJobs();

  const payloadFile = path.join(CONFIG.payloadsDir, `${testJobId}.json`);
  assert.ok(fs.existsSync(payloadFile));
  assert.ok(!fs.readFileSync(CONFIG.jobsFile, 'utf8').includes(largeResult));

  jobManager.jobs.clear();
  jobManager._loadJobs();
  const recovered = jobManager.getJob(testJobId);
  assert.strictEqual(recovered.response, largeResult);

  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const indexSource = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
  const indexVersion = (indexSource.match(/version:\s*'([^']+)'/) || [])[1];

  assert.strictEqual(manifest.version, '2.1.0');
  assert.strictEqual(pkg.version, '2.1.0');
  assert.strictEqual(indexVersion, '2.1.0');
  assert.ok(!fs.existsSync(path.join(root, 'src', 'dashboard.js')), 'dashboard.js debe haber sido eliminado');
  console.log('  ✅ Segregación y manifiesto v2.1.0 PASS.');
}

async function testUsageStatsAndRateLimitPropagation() {
  console.log('\n[TEST 5] Telemetría de uso, errores de límite y hora de renovación...');
  const orig = {
    request: client.request,
    getSessionMessages: client.getSessionMessages,
    getSessionDiff: client.getSessionDiff
  };

  try {
    const occurredAt = new Date('2026-11-25T14:40:00.000Z').getTime();
    const retryAfterMs = 6 * 3600 * 1000 + 5 * 60 * 1000; // +6h 5m

    // 5a. waitForCompletion debe fallar exponiendo mensaje literal de OpenCode y resetsAt (nunca falso COMPLETED)
    client.request = async (reqPath) => {
      if (reqPath === '/api/session/ses_limit') {
        return { id: 'ses_limit', time: { created: occurredAt - 1000, busy: occurredAt - 500, idle: occurredAt } };
      }
      if (reqPath.startsWith('/api/experimental/session/stats')) {
        return {
          sessions: 4,
          prompts: 9,
          steps: 25,
          tokens: { input: 1200, output: 300, reasoning: 150, cache: { read: 5000, write: 0 } },
          cost: 0,
          models: [
            {
              model: { id: 'deepseek-v4.1-flash-free', providerID: 'opencode', variant: 'default' },
              steps: 25,
              tokens: { input: 1200, output: 300, reasoning: 150, cache: { read: 5000, write: 0 } },
              cost: 0
            }
          ]
        };
      }
      if (reqPath === '/api/experimental/usage/limits') {
        return null;
      }
      if (reqPath === '/api/session') {
        return [
          {
            id: 'ses_limit',
            title: 'Límite DeepSeek',
            model: { providerID: 'opencode', id: 'deepseek-v4.1-flash-free' },
            tokens: { input: 0, output: 0, reasoning: 0 },
            time: { created: occurredAt - 1000, updated: occurredAt, idle: occurredAt }
          }
        ];
      }
      return [];
    };

    client.getSessionMessages = async () => [
      { id: 'u1', type: 'user', time: { created: occurredAt - 800 }, text: 'Hola' },
      {
        id: 'a1',
        type: 'assistant',
        time: { created: occurredAt - 500, completed: occurredAt },
        model: { providerID: 'opencode', id: 'deepseek-v4.1-flash-free' },
        content: [],
        finish: 'error',
        error: {
          type: 'provider.free-limit',
          status: 429,
          message: 'Free usage limit reached. Connect a provider or subscribe to OpenCode Go.',
          retryAfterMs
        }
      },
      {
        id: 'i1',
        type: 'idle',
        outcome: 'failed',
        time: { created: occurredAt },
        error: {
          type: 'provider.free-limit',
          status: 429,
          message: 'Free usage limit reached. Connect a provider or subscribe to OpenCode Go.',
          retryAfterMs
        }
      }
    ];
    client.getSessionDiff = async () => [];

    let caughtErr = null;
    try {
      await client.waitForCompletion('ses_limit', 5000, occurredAt - 900);
    } catch (e) {
      caughtErr = e;
    }
    assert.ok(caughtErr, 'waitForCompletion debe lanzar Error ante idle outcome=failed');
    assert.ok(caughtErr.message.includes('Free usage limit reached'), 'Debe propagar el mensaje exacto de OpenCode');
    assert.ok(caughtErr.providerError?.resetsAtIso, 'Debe calcular resetsAtIso desde retryAfterMs');
    assert.strictEqual(caughtErr.providerError.status, 429);

    // 5b. readSessionMessages debe incluir latestError y el mensaje idle fallido
    const transcript = await client.readSessionMessages('ses_limit');
    assert.ok(transcript.latestError, 'readSessionMessages debe exponer latestError');
    assert.strictEqual(transcript.latestError.type, 'provider.free-limit');
    assert.ok(transcript.messages.some((m) => m.type === 'idle' && m.error), 'Debe conservar eventos idle con error');

    // 5c. getUsageStats debe agregar tokens, limits y avisos recientes de renovación
    const usage = await client.getUsageStats({ days: 0 });
    assert.strictEqual(usage.totals.tokens.totalDirect, 1650);
    assert.strictEqual(usage.totals.tokens.cacheRead, 5000);
    assert.strictEqual(usage.byModel[0].model, 'opencode/deepseek-v4.1-flash-free');
    assert.strictEqual(usage.providerLimits.remainingFreeQuotaKnown, false);
    assert.strictEqual(usage.recentProviderNotices.length, 1);
    assert.strictEqual(usage.recentProviderNotices[0].status, 429);
    assert.ok(usage.recentProviderNotices[0].resetsAtIso);

    console.log('  ✅ Telemetría de uso, errores de límite y hora de renovación PASS.');
  } finally {
    Object.assign(client, orig);
  }
}

async function run() {
  try {
    await testDecentralizedModelParsingAndListing();
    await testDynamicCircuitBreaker();
    await testMultiTurnAndSessionReading();
    await testPayloadSegregationAndManifest();
    await testUsageStatsAndRateLimitPropagation();
    console.log('\n🎯 [100% PASS] OpenBridge v2.1.0 certificado como puente descentralizado.');
    process.exitCode = 0;
  } catch (err) {
    console.error('\n❌ ERROR EN TEST v2.1.0:', err);
    process.exitCode = 1;
  } finally {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  }
}

await run();
