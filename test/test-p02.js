import { client } from '../src/client.js';

async function run() {
  console.log('[TEST-P02] Iniciando prueba de humo descentralizada de OpenBridge MCP...');

  try {
    console.log('[TEST-P02] 1. Descubriendo modelos disponibles en OpenCode...');
    const models = await client.listModels();
    console.log(`[TEST-P02] Modelos encontrados (${models.length}). Primeros 5:`, models.slice(0, 5).map((m) => m.fullId));

    if (models.length === 0) {
      throw new Error('No se encontraron modelos disponibles en OpenCode.');
    }

    const preferred =
      process.env.OPENCODE_DEFAULT_MODEL ||
      models.find((m) => m.isFree)?.fullId ||
      models[0].fullId;

    console.log(`[TEST-P02] 2. Creando sesión delegada con modelo: ${preferred}...`);
    const sessionID = await client.createSession({
      title: 'test-p02-verification',
      model: preferred
    });

    const promptText = '[MODO SOLO LECTURA]\nCalcula la suma de 1542 + 458. Responde unicamente con el numero del resultado.';
    const sent = await client.sendPrompt(sessionID, promptText);
    const result = await client.waitForCompletion(sessionID, 90000, sent?.time?.created || 0);

    console.log('[TEST-P02] Resultado:', {
      outcome: result.outcome,
      model: result.model?.id,
      tokens: result.tokens,
      text: result.text.trim()
    });

    if (result.outcome === 'succeeded' && result.text.length > 0) {
      console.log('✅ [P02 PASS] Puente descentralizado verificado con éxito.');
      process.exit(0);
    }
    throw new Error(`Resultado inesperado: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error('❌ [P02 FAIL]:', err.message);
    process.exit(1);
  }
}

run();
