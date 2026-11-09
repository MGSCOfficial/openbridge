import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { client } from './client.js';
import { CONFIG } from './config.js';
import { checkServerAuth, ensureServerRunning, stopSpawnedServer } from './server-manager.js';
import { jobManager } from './job-manager.js';
import { createSandbox, cleanupSandbox } from './sandbox-manager.js';
import { eventStream } from './event-stream.js';
import { startDashboardServer, stopDashboardServer } from './dashboard.js';

const server = new McpServer({
  name: 'openbridge-mcp',
  version: '1.1.0'
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

// 2. Tool: Delegate Task (Sync con Auto-Handoff Preventivo)
server.tool(
  'openbridge_delegate_task',
  'Delega una tarea con Auto-Handoff preventivo (120s): si el modelo tarda mas de 2 minutos pensando, transfiere la tarea de forma transparente a segundo plano para prevenir el corte de socket de Antigravity (180s).',
  {
    task: z.string().describe('Instruccion detallada de la tarea que debe realizar el worker externo'),
    model: z.string().optional().default(CONFIG.defaultModel).describe('Modelo objetivo (ej. opencode/nemotron-3.5-lightning-free, opencode/nemotron-3.5-super-vl-free, opencode/deepseek-v4.1-flash-free)'),
    working_dir: z.string().optional().describe('Directorio absoluto de trabajo sobre el que debe operar OpenCode. Si se omite y read_only es true, opera en sandbox efimero.'),
    read_only: z.boolean().optional().default(false).describe('Si es true, le indica al modelo devolver analisis o codigo sugerido sin escribir archivos en disco.'),
    timeout_seconds: z.number().optional().default(600).describe('Tiempo maximo total de espera en segundos')
  },
  async (args) => {
    try {
      // 1. Iniciar a través de jobManager para registrar estado y telemetría
      const jobInfo = await jobManager.startJob(args);

      // 2. Límite síncrono seguro: máximo 120s (Antigravity fuerza deadline a 180s)
      const maxSyncMs = Math.min((args.timeout_seconds || 600) * 1000, 120000);

      // 3. Espera síncrona o handoff
      const outcome = await jobManager.waitForJob(jobInfo.jobId, maxSyncMs);

      if (outcome.done) {
        const j = outcome.job;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionID: j.sessionID,
                  jobId: j.jobId,
                  outcome: j.outcome,
                  modelUsed: j.modelUsed || j.model,
                  tokens: j.tokens,
                  costUsd: 0,
                  geminiQuotaOffloaded: '100%',
                  durationSeconds: j.durationSeconds,
                  diffsCount: j.diffs?.length || 0,
                  diffs: j.diffs,
                  response: j.result
                },
                null,
                2
              )
            }
          ]
        };
      }

      // Si alcanzó los 120s sin fallar: Auto-Handoff transparente
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'HANDOFF_TO_ASYNC',
                jobId: jobInfo.jobId,
                sessionID: jobInfo.sessionID,
                model: jobInfo.model,
                elapsedSeconds: Math.round(maxSyncMs / 1000),
                geminiQuotaOffloaded: '100%',
                message: 'El modelo continúa procesando un razonamiento profundo (Chain-of-Thought). Para prevenir el corte por timeout de 180s en Antigravity, la tarea fue transferida a segundo plano con seguridad total. Monitorea el progreso con openbridge_check_task o en el dashboard en vivo (http://localhost:4098).'
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

// 3. Tool: Start Task (Async Multi-Agent Swarm)
server.tool(
  'openbridge_start_task',
  'DISPARO ASINCRONO MULTIAGENTE: Lanza una tarea en background y retorna un task_id de inmediato (<50ms) sin bloquear a Antigravity, permitiendo lanzar enjambres de modelos en paralelo.',
  {
    task: z.string().describe('Instruccion tecnica detallada para el worker externo'),
    model: z.string().optional().default(CONFIG.defaultModel).describe('Modelo objetivo (ej. opencode/nemotron-3.5-lightning-free, opencode/nemotron-3.5-super-vl-free, opencode/deepseek-v4.1-flash-free)'),
    working_dir: z.string().optional().describe('Directorio absoluto de trabajo. Si se omite, opera en sandbox aislado.'),
    read_only: z.boolean().optional().default(false).describe('Si es true, no altera archivos en disco y reduce el consumo de tokens al minimo.'),
    timeout_seconds: z.number().optional().default(600).describe('Tiempo maximo de espera en segundos')
  },
  async (args) => {
    try {
      const job = await jobManager.startJob(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(job, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al iniciar tarea asincrona: ${err.message}` }]
      };
    }
  }
);

// 4. Tool: Check Task
server.tool(
  'openbridge_check_task',
  'Comprueba el estado de una tarea asincrona previa lanzada con openbridge_start_task y recolecta el resultado cuando este completada.',
  {
    task_id: z.string().describe('Identificador unico de la tarea (ej. job_xxxxxxxx)')
  },
  async ({ task_id }) => {
    try {
      const res = jobManager.getJob(task_id);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al consultar tarea: ${err.message}` }]
      };
    }
  }
);

// 5. Tool: Cancel Task
server.tool(
  'openbridge_cancel_task',
  'Cancela e interrumpe de forma limpia una tarea asincrona en curso.',
  {
    task_id: z.string().describe('Identificador de la tarea a cancelar')
  },
  async ({ task_id }) => {
    try {
      const res = await jobManager.cancelJob(task_id);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al cancelar tarea: ${err.message}` }]
      };
    }
  }
);

// 6. Tool: List Active Tasks
server.tool(
  'openbridge_list_active_tasks',
  'Lista todas las tareas asincronas activas o recientes en el gestor de enjambres de OpenBridge.',
  {
    limit: z.number().optional().default(20).describe('Cantidad maxima de tareas a listar')
  },
  async ({ limit }) => {
    try {
      const res = jobManager.listJobs(limit);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error al listar tareas: ${err.message}` }]
      };
    }
  }
);

// 7. Tool: Get Diff
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

// 8. Tool: Status
server.tool(
  'openbridge_status',
  'Verifica el estado del daemon local de OpenCode, transporte SSE y conectividad.',
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
                eventStreamConnected: eventStream.connected,
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
