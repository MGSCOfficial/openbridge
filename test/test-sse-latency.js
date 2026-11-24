import { client } from '../src/client.js';
import { eventStream } from '../src/event-stream.js';
import { createSandbox, cleanupSandbox } from '../src/sandbox-manager.js';

async function run() {
  console.log('[TEST-LATENCY] Iniciando prueba de SSE en tiempo real y sandbox ligero...');

  try {
    await eventStream.start();
    const models = await client.listModels();
    const targetModel =
      process.env.OPENCODE_DEFAULT_MODEL ||
      models.find((m) => m.isFree)?.fullId ||
      models[0]?.fullId ||
      null;

    const sandboxId = `test_latency_${Date.now()}`;
    const sandboxDir = createSandbox(sandboxId);

    const sessionID = await client.createSession({
      title: 'test-latency-sse',
      model: targetModel,
      directory: sandboxDir
    });

    const t0 = Date.now();
    const sent = await client.sendPrompt(sessionID, '[SOLO LECTURA] Responde solo: PUENTE_ACTIVO');
    const result = await client.waitForCompletion(sessionID, 60000, sent?.time?.created || t0);
    const duration = Date.now() - t0;

    cleanupSandbox(sandboxId);

    if (result.outcome === 'succeeded') {
      console.log(`✅ [LATENCY PASS] Respuesta capturada con ${targetModel || 'default'} en ${duration}ms.`);
      process.exit(0);
    }
    throw new Error(`Resultado inesperado: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error('❌ [LATENCY FAIL]:', err.message);
    process.exit(1);
  }
}

run();
