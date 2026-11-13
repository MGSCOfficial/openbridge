import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CONFIG } from './config.js';
import { ensureServerRunning, stopSpawnedServer } from './server-manager.js';
import { eventStream } from './event-stream.js';
import { startDashboardServer, stopDashboardServer } from './dashboard.js';
import { registerAllTools } from './tools.js';

const server = new McpServer({
  name: 'openbridge-mcp',
  version: '1.1.0-beta.2'
});

// Registrar todas las herramientas de forma unificada desde src/tools.js (Cero Código Muerto)
registerAllTools(server);

async function main() {
  await ensureServerRunning();
  await eventStream.start().catch(() => {});
  startDashboardServer(CONFIG.dashboardPort);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on('SIGINT', () => {
  stopDashboardServer();
  eventStream.stop();
  stopSpawnedServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopDashboardServer();
  eventStream.stop();
  stopSpawnedServer();
  process.exit(0);
});

main().catch((err) => {
  console.error('[OpenBridge MCP Fatal Error]:', err);
  process.exit(1);
});
