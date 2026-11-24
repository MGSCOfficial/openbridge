import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureServerRunning, stopSpawnedServer } from './server-manager.js';
import { eventStream } from './event-stream.js';
import { registerAllTools } from './tools.js';

const server = new McpServer({
  name: 'openbridge-mcp',
  version: '2.0.0'
});

registerAllTools(server);

async function main() {
  await ensureServerRunning();
  await eventStream.start().catch(() => {});
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on('SIGINT', () => {
  eventStream.stop();
  stopSpawnedServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  eventStream.stop();
  stopSpawnedServer();
  process.exit(0);
});

main().catch((err) => {
  console.error('[OpenBridge MCP Fatal Error]:', err);
  process.exit(1);
});
