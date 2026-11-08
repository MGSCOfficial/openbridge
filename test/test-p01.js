import { ensureServerRunning, isServerAlive, checkServerAuth } from '../src/server-manager.js';

async function run() {
  console.log('[TEST-P01] Verificando ciclo de vida del servidor OpenCode...');
  try {
    const status = await ensureServerRunning();
    console.log('[TEST-P01] Resultado ensureServerRunning:', status);

    const alive = await isServerAlive();
    console.log('[TEST-P01] Servidor activo (isServerAlive):', alive);

    const authCheck = await checkServerAuth();
    console.log('[TEST-P01] Comprobación de autenticación (checkServerAuth):', authCheck.ok ? 'EXITOSA (200 OK)' : authCheck);

    if (status.running && alive) {
      console.log('✅ [P01 PASS] Daemon & Server Manager funcionando correctamente.');
      process.exit(0);
    } else {
      console.error('❌ [P01 FAIL] El servidor no respondió como se esperaba.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ [P01 ERROR]:', err);
    process.exit(1);
  }
}

run();
