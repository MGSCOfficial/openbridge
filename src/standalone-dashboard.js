import { CONFIG } from './config.js';
import { ensureServerRunning } from './server-manager.js';
import { eventStream } from './event-stream.js';
import { startDashboardServer } from './dashboard.js';

async function run() {
  await ensureServerRunning();
  await eventStream.start().catch(() => {});
  startDashboardServer(CONFIG.dashboardPort);
  console.log(`[OpenBridge Telemetry]: Servidor activo en http://127.0.0.1:${CONFIG.dashboardPort}`);
}

run().catch((err) => {
  console.error('[OpenBridge Dashboard Standalone Error]:', err);
});
