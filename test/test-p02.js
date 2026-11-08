import { client } from '../src/client.js';
import { CONFIG } from '../src/config.js';

async function run() {
  console.log('[TEST-P02] Iniciando prueba de humo del cliente OpenBridge MCP...');

  try {
    // 1. Test listing models
    console.log('[TEST-P02] 1. Consultando modelos gratuitos de Nemotron...');
    const models = await client.listModels({ freeOnly: true, search: 'nemotron' });
    console.log(`[TEST-P02] Modelos encontrados (${models.length}):`, models.map((m) => `${m.providerID}/${m.id}`));

    if (models.length === 0) {
      throw new Error('No se encontraron modelos gratuitos de Nemotron en el catálogo local.');
    }

    // 2. Test delegating a real prompt to Nemotron 3.5 Lightning Free
    const targetModel = 'opencode/nemotron-3.5-lightning-free';
    console.log(`[TEST-P02] 2. Creando sesión delegada con modelo: ${targetModel}...`);

    const sessionID = await client.createSession({
      title: 'test-p02-verification',
      model: targetModel
    });
    console.log('[TEST-P02] Sesión creada con ID:', sessionID);

    console.log('[TEST-P02] 3. Enviando prompt de cálculo y respuesta concisa...');
    const promptText = '[MODO SOLO LECTURA]\nCalcula la suma de 1542 + 458. Responde unicamente con el numero del resultado y la confirmacion de que eres Nemotron.';
    await client.sendPrompt(sessionID, promptText);

    console.log('[TEST-P02] 4. Esperando respuesta de finalización (timeout 90s)...');
    const result = await client.waitForCompletion(sessionID, 90000);

    console.log('[TEST-P02] Resultado recibido:');
    console.log('  • Outcome:', result.outcome);
    console.log('  • Modelo usado:', result.model?.id);
    console.log('  • Tokens:', result.tokens);
    console.log('  • Duración:', `${Math.round(result.durationMs / 1000)}s`);
    console.log('  • Respuesta:', result.text.trim());

    if (result.outcome === 'succeeded' && result.text.length > 0) {
      console.log('✅ [P02 PASS] Protocolo MCP y cliente de delegación verificados con éxito.');
      process.exit(0);
    } else {
      throw new Error(`Resultado inesperado: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    console.error('❌ [P02 FAIL]:', err.message);
    process.exit(1);
  }
}

run();
