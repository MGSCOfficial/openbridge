import { z } from 'zod';
import { client, getModelHealthMap } from './client.js';
import { CONFIG } from './config.js';
import { checkServerAuth } from './server-manager.js';
import { jobManager } from './job-manager.js';
import { eventStream } from './event-stream.js';

export const TOOLS = [
  {
    name: 'openbridge_list_models',
    description: 'Lista todos los modelos e inteligencias artificiales disponibles en el daemon de OpenCode (cualquier proveedor configurado: opencode, openrouter, anthropic, openai, google, ollama, etc.).',
    parameters: {
      provider: z.string().optional().default('all').describe('Filtrar por proveedor configurado en OpenCode (ej. all, opencode, openrouter, anthropic, openai, ollama)'),
      free_only: z.boolean().optional().default(false).describe('Si es true, filtra unicamente modelos con coste 0 o gratuitos'),
      search: z.string().optional().default('').describe('Termino de busqueda opcional en el ID, nombre o proveedor del modelo')
    },
    execute: async (args) => {
      try {
        const models = await client.listModels({
          provider: args.provider,
          freeOnly: args.free_only,
          search: args.search
        });
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
  },
  {
    name: 'openbridge_delegate_task',
    description: 'Delega un prompt a cualquier modelo de OpenCode (creando sesion nueva o continuando una existente con session_id) con Auto-Handoff preventivo a los 120s.',
    parameters: {
      task: z.string().describe('Instruccion o mensaje que debe procesarse en OpenCode'),
      model: z.string().optional().describe('Modelo objetivo en formato provider/model (opcional; si se omite usa OPENCODE_DEFAULT_MODEL o el activo en OpenCode)'),
      session_id: z.string().optional().describe('ID de una sesion existente de OpenCode para continuar una conversacion multi-turno'),
      fallback_models: z.array(z.string()).optional().describe('Lista opcional de modelos de respaldo ante errores 429/5xx'),
      working_dir: z.string().optional().describe('Directorio absoluto de trabajo para OpenCode. Si se omite y read_only es true, opera en sandbox efimero.'),
      read_only: z.boolean().optional().default(false).describe('Si es true, indica al agente devolver su respuesta sin modificar archivos en disco.'),
      timeout_seconds: z.number().optional().default(600).describe('Tiempo maximo total de espera en segundos'),
      call_depth: z.number().optional().default(0).describe('Profundidad actual de recursion agentica (controlada para prevenir bucles infinitos)')
    },
    execute: async (args) => {
      try {
        const jobInfo = await jobManager.startJob(args);
        const maxSyncMs = Math.min((args.timeout_seconds || 600) * 1000, 120000);
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
                    resumedSession: Boolean(j.resumedSession),
                    outcome: j.outcome,
                    modelUsed: j.modelUsed || j.model || 'opencode-default',
                    tokens: j.tokens,
                    cost: j.cost ?? null,
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
                  message: 'La tarea excedio la ventana sincrona de 120s y paso a segundo plano de forma segura. Monitorea o recolecta el resultado con openbridge_check_task.'
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
  },
  {
    name: 'openbridge_start_task',
    description: 'Lanza una tarea asincrona en background hacia cualquier modelo de OpenCode (o continua una sesion con session_id) y retorna un jobId de inmediato sin bloquear el turno.',
    parameters: {
      task: z.string().describe('Instruccion o mensaje para la sesion en OpenCode'),
      model: z.string().optional().describe('Modelo objetivo en formato provider/model (opcional; si se omite usa OPENCODE_DEFAULT_MODEL o el activo en OpenCode)'),
      session_id: z.string().optional().describe('ID de una sesion existente de OpenCode para continuar una conversacion multi-turno'),
      fallback_models: z.array(z.string()).optional().describe('Lista opcional de modelos de respaldo ante errores 429/5xx'),
      working_dir: z.string().optional().describe('Directorio absoluto de trabajo. Si se omite y read_only es true, opera en sandbox aislado.'),
      read_only: z.boolean().optional().default(false).describe('Si es true, indica no alterar archivos en disco.'),
      timeout_seconds: z.number().optional().default(600).describe('Tiempo maximo de espera en segundos'),
      call_depth: z.number().optional().default(0).describe('Profundidad de llamada para prevenir recursion')
    },
    execute: async (args) => {
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
  },
  {
    name: 'openbridge_check_task',
    description: 'Comprueba el estado de una tarea asincrona previa lanzada con openbridge_start_task y recolecta resultado, tokens y diffs cuando este completada.',
    parameters: {
      task_id: z.string().describe('Identificador unico de la tarea (ej. job_xxxxxxxx)')
    },
    execute: async ({ task_id }) => {
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
  },
  {
    name: 'openbridge_cancel_task',
    description: 'Cancela e interrumpe de forma limpia una tarea asincrona en curso.',
    parameters: {
      task_id: z.string().describe('Identificador de la tarea a cancelar')
    },
    execute: async ({ task_id }) => {
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
  },
  {
    name: 'openbridge_list_active_tasks',
    description: 'Lista los jobs registrados recientemente en OpenBridge (activos o completados).',
    parameters: {
      limit: z.number().optional().default(20).describe('Cantidad maxima de tareas a listar')
    },
    execute: async ({ limit }) => {
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
  },
  {
    name: 'openbridge_list_sessions',
    description: 'Lista las sesiones recientes directamente desde el daemon de OpenCode (incluyendo sesiones creadas fuera de OpenBridge) para inspeccionarlas o continuarlas.',
    parameters: {
      limit: z.number().optional().default(20).describe('Cantidad maxima de sesiones recientes a listar')
    },
    execute: async ({ limit }) => {
      try {
        const sessions = await client.listSessions(limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ total: sessions.length, sessions }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al listar sesiones de OpenCode: ${err.message}` }]
        };
      }
    }
  },
  {
    name: 'openbridge_get_messages',
    description: 'Lee el historial de mensajes (usuario, respuestas de IA, herramientas y tokens) de cualquier sesion existente en OpenCode.',
    parameters: {
      session_id: z.string().describe('ID de la sesion de OpenCode (ej. ses_xxxxxxxx)'),
      limit: z.number().optional().default(50).describe('Cantidad maxima de mensajes recientes a devolver'),
      include_reasoning: z.boolean().optional().default(false).describe('Si es true, incluye los bloques de razonamiento interno del modelo')
    },
    execute: async ({ session_id, limit, include_reasoning }) => {
      try {
        const transcript = await client.readSessionMessages(session_id, {
          limit,
          includeReasoning: include_reasoning
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(transcript, null, 2) }]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al leer mensajes de la sesion: ${err.message}` }]
        };
      }
    }
  },
  {
    name: 'openbridge_get_diff',
    description: 'Recupera los diffs de Git o archivos generados durante una sesion de OpenCode para auditar antes de fusionar.',
    parameters: {
      session_id: z.string().describe('ID de la sesion de OpenCode')
    },
    execute: async ({ session_id }) => {
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
  },
  {
    name: 'openbridge_status',
    description: 'Verifica el estado del daemon local de OpenCode, transporte SSE, configuracion del puente y salud de modelos observados.',
    parameters: {},
    execute: async () => {
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
                  fallbackModels: CONFIG.fallbackModels,
                  maxRecursionDepth: CONFIG.maxDepth,
                  payloadSegregation: 'ACTIVE',
                  modelPoolHealth: getModelHealthMap(),
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
  }
];

export function registerAllTools(server) {
  for (const tool of TOOLS) {
    server.tool(tool.name, tool.description, tool.parameters, tool.execute);
  }
}
