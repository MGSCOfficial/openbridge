import { client } from '../src/client.js';
import { eventStream } from '../src/event-stream.js';
import { createSandbox, cleanupSandbox } from '../src/sandbox-manager.js';

async function run() {
  console.log('[TEST-LATENCY] Iniciando prueba de SSE en tiempo real y sandbox ligero...');

  try {
    await eventStream.start();
    console.log('[TEST-LATENCY] EventStream SSE conectado con éxito.');

    const sandboxId = `test_latency_${Date.now()}`;
    const sandboxDir = createSandbox(sandboxId);
    console.log('[TEST-LATENCY] Sandbox efímero creado en:', sandboxDir);

    const sessionID = await client.createSession({
      title: 'test-latency-sse',
      model: 'opencode/nemotron-3.5-lightning-free',
      directory: sandboxDir
    });
    console.log('[TEST-LATENCY] Sesión creada:', sessionID);

    const t0 = Date.now();
    await client.sendPrompt(sessionID, '[SOLO LECTURA] Responde solo: V1.1_ACTIVO');

    console.log('[TEST-LATENCY] Esperando respuesta reactiva vía SSE...');
    const result = await client.waitForCompletion(sessionID, 60000);
    const duration = Date.now() - t0;

    console.log('[TEST-LATENCY] Resultado recibido:');
    console.log('  • Duración total:', `${duration}ms`);
    console.log('  • Tokens:', result.tokens);
    console.log('  • Respuesta:', result.text.trim());

    cleanupSandbox(sandboxId);

    if (result.outcome === 'succeeded' && result.tokens.input < 300) {
      console.log(`✅ [LATENCY PASS] Éxito: Tokens de entrada reducidos a ${result.tokens.input} (vs 1200+ previo) y respuesta capturada en ${duration}ms.`);
      process.exit(0);
    } else if (result.outcome === 'succeeded') {
      console.log(`✅ [LATENCY PASS] Respuesta capturada con éxito en ${duration}ms (Tokens input: ${result.tokens.input}).`);
      process.exit(0);
    } else {
      throw new Error(`Resultado inesperado: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    console.error('❌ [LATENCY FAIL]:', err.message);
    process.exit(1);
  }
}

run();
