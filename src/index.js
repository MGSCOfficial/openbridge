import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { client } from './client.js';
import { CONFIG } from './config.js';
import { checkServerAuth, ensureServerRunning, stopSpawnedServer } from './server-manager.js';

const server = new McpServer({
  name: 'openbridge-mcp',
  version: '1.0.0'
});

// 1. Tool: List Models
server.tool(
  'openbridge_list_models',
  'Lista los modelos de IA disponibles a traves de OpenCode Zen y OpenRouter, indicando modelos 100% gratuitos (como NVIDIA Nemotron 3.5 Lightning Free, Super VL Free, Gemma o DeepSeek Flash).',
  {
    provider: z.enum(['all', 'opencode', 'openrouter']).optional().default('all').describe('Filtrar por proveedor (all, opencode, openrouter)'),
    free_only: z.boolean().optional().default(true).describe('Mostrar unicamente modelos gratuitos con coste $0'),
    search: z.string().optional().default('').describe('Termino de busqueda opcional (ej. nemotron, gemma, flash)')
  },
  async (args) => {
    try {
      const models = await client.listModels(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: models.length,
                providerFilter: args.provider,
                freeOnly: args.free_only,
                models
              },
              null,
              2
            )
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al listar modelos: ${err.message}` }]
      };
    }
  }
);

// 2. Tool: Delegate Task
server.tool(
  'openbridge_delegate_task',
  'Delega una tarea de programacion, scaffolding, escaneo o pruebas masivas a un modelo gratuito de OpenCode Zen (ej. NVIDIA Nemotron 3.5), descargando 100% la cuota de Gemini en Antigravity.',
  {
    task: z.string().describe('Instruccion detallada de la tarea que debe realizar el worker externo'),
    model: z.string().optional().default(CONFIG.defaultModel).describe('Modelo objetivo (por defecto opencode/nemotron-3.5-lightning-free o variant Super VL)'),
    working_dir: z.string().optional().describe('Directorio absoluto de trabajo sobre el que debe operar OpenCode. Si se omite, opera de forma aislada.'),
    read_only: z.boolean().optional().default(false).describe('Si es true, le indica al modelo devolver analisis o codigo sugerido sin escribir archivos en disco.'),
    timeout_seconds: z.number().optional().default(120).describe('Tiempo maximo de espera en segundos')
  },
  async (args) => {
    try {
      let promptText = args.task;
      if (args.read_only) {
        promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCION, CODIGO O ANALISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${args.task}`;
      }

      const sessionID = await client.createSession({
        title: `openbridge-${Date.now()}`,
        model: args.model || CONFIG.defaultModel,
        directory: args.working_dir || null
      });

      await client.sendPrompt(sessionID, promptText);

      const timeoutMs = (args.timeout_seconds || 120) * 1000;
      const result = await client.waitForCompletion(sessionID, timeoutMs);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionID: result.sessionID,
                outcome: result.outcome,
                modelUsed: result.model?.id || args.model,
                tokens: result.tokens,
                costUsd: 0,
                geminiQuotaOffloaded: '100%',
                durationSeconds: Math.round(result.durationMs / 1000),
                diffsCount: result.diffs?.length || 0,
                diffs: result.diffs,
                response: result.text
              },
              null,
              2
            )
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error en tarea delegada: ${err.message}` }]
      };
    }
  }
);

// 3. Tool: Get Diff
server.tool(
  'openbridge_get_diff',
  'Recupera los diffs de Git o archivos generados durante una sesion previa delegada a OpenCode para auditar antes de fusionar.',
  {
    session_id: z.string().describe('ID de la sesion de OpenCode')
  },
  async ({ session_id }) => {
    try {
      const diffs = await client.getSessionDiff(session_id);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ sessionID: session_id, diffs }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al obtener diffs: ${err.message}` }]
      };
    }
  }
);

// 4. Tool: Status
server.tool(
  'openbridge_status',
  'Verifica el estado del daemon local de OpenCode, puerto y conectividad.',
  {},
  async () => {
    try {
      const auth = await checkServerAuth();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                serverUrl: `http://${CONFIG.hostname}:${CONFIG.port}`,
                status: auth.ok ? 'ONLINE' : 'OFFLINE',
                defaultModel: CONFIG.defaultModel,
                multimodalModel: CONFIG.multimodalModel,
                details: auth.data || auth.error || 'Server ready'
              },
              null,
              2
            )
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al consultar estado: ${err.message}` }]
      };
    }
  }
);

async function main() {
  await ensureServerRunning();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on('SIGINT', () => {
  stopSpawnedServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopSpawnedServer();
  process.exit(0);
});

main().catch((err) => {
  console.error('[OpenBridge MCP Fatal Error]:', err);
  process.exit(1);
});
