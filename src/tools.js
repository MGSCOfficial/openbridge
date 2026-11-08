import { z } from 'zod';
import { client } from './client.js';
import { CONFIG } from './config.js';
import { checkServerAuth } from './server-manager.js';
import { jobManager } from './job-manager.js';
import { createSandbox, cleanupSandbox } from './sandbox-manager.js';

export const TOOLS = [
  {
    name: 'openbridge_list_models',
    description: 'Lista los modelos de IA disponibles a traves de OpenCode Zen y OpenRouter, indicando modelos 100% gratuitos (como NVIDIA Nemotron 3.5 Lightning Free, Super VL Free, Gemma o DeepSeek Flash).',
    parameters: z.object({
      provider: z.enum(['all', 'opencode', 'openrouter']).optional().default('all').describe('Filtrar por proveedor'),
      free_only: z.boolean().optional().default(true).describe('Mostrar unicamente modelos gratuitos con coste $0'),
      search: z.string().optional().default('').describe('Termino de busqueda opcional (ej. nemotron, gemma, flash)')
    }),
    execute: async (args) => {
      const models = await client.listModels(args);
      return {
        total: models.length,
        models
      };
    }
  },
  {
    name: 'openbridge_delegate_task',
    description: 'Delega una tarea de programacion de forma sincrona a un modelo de OpenCode Zen (ej. NVIDIA Nemotron 3.5) esperando la respuesta con latencia minima via SSE.',
    parameters: z.object({
      task: z.string().describe('Instruccion detallada de la tarea que debe realizar el worker externo'),
      model: z.string().optional().default(CONFIG.defaultModel).describe('Modelo objetivo (ej. opencode/nemotron-3.5-lightning-free, opencode/nemotron-3.5-super-vl-free)'),
      working_dir: z.string().optional().describe('Directorio absoluto de trabajo sobre el que debe operar OpenCode. Si se omite y read_only es true, utiliza un sandbox efimero ultraligero.'),
      read_only: z.boolean().optional().default(false).describe('Si es true, le indica al modelo devolver analisis o codigo en texto plano sin tocar archivos en disco.'),
      timeout_seconds: z.number().optional().default(600).describe('Tiempo maximo de espera en segundos')
    }),
    execute: async (args) => {
      let promptText = args.task;
      let sandboxDir = null;
      let effectiveDir = args.working_dir || null;

      if (args.read_only && !effectiveDir) {
        sandboxDir = createSandbox(`sync_${Date.now()}`);
        effectiveDir = sandboxDir;
        promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCION, CODIGO O ANALISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${args.task}`;
      }

      try {
        const sessionID = await client.createSession({
          title: `openbridge-sync-${Date.now()}`,
          model: args.model || CONFIG.defaultModel,
          directory: effectiveDir
        });

        await client.sendPrompt(sessionID, promptText);

        const timeoutMs = (args.timeout_seconds || 600) * 1000;
        const result = await client.waitForCompletion(sessionID, timeoutMs);

        return {
          sessionID: result.sessionID,
          outcome: result.outcome,
          modelUsed: result.model?.id || args.model,
          tokens: result.tokens,
          costUsd: 0,
          geminiQuotaSaved: '100%',
          response: result.text,
          diffs: result.diffs,
          durationSeconds: Math.round(result.durationMs / 1000)
        };
      } finally {
        if (sandboxDir) {
          cleanupSandbox(sandboxDir);
        }
      }
    }
  },
  {
    name: 'openbridge_start_task',
    description: 'DISPARO ASINCRONO MULTIAGENTE: Inicia una tarea en background y retorna un task_id de inmediato (<50ms) sin bloquear a Antigravity, permitiendo lanzar enjambres de modelos en paralelo.',
    parameters: z.object({
      task: z.string().describe('Instruccion tecnica detallada para el worker externo'),
      model: z.string().optional().default(CONFIG.defaultModel).describe('Modelo objetivo (ej. opencode/nemotron-3.5-lightning-free, opencode/nemotron-3.5-super-vl-free, opencode/deepseek-v4.1-flash-free)'),
      working_dir: z.string().optional().describe('Directorio absoluto de trabajo. Si se omite, opera en sandbox aislado.'),
      read_only: z.boolean().optional().default(false).describe('Si es true, no altera archivos en disco y reduce el consumo de tokens al minimo.'),
      timeout_seconds: z.number().optional().default(600).describe('Tiempo maximo de espera en segundos')
    }),
    execute: async (args) => {
      return jobManager.startJob(args);
    }
  },
  {
    name: 'openbridge_check_task',
    description: 'Comprueba el estado de una tarea asincrona previa lanzada con openbridge_start_task y recolecta el resultado cuando este completada.',
    parameters: z.object({
      task_id: z.string().describe('Identificador unico de la tarea (ej. job_xxxxxxxx)')
    }),
    execute: async (args) => {
      return jobManager.getJob(args.task_id);
    }
  },
  {
    name: 'openbridge_cancel_task',
    description: 'Cancela e interrumpe de forma limpia una tarea asincrona en curso.',
    parameters: z.object({
      task_id: z.string().describe('Identificador de la tarea a cancelar')
    }),
    execute: async (args) => {
      return jobManager.cancelJob(args.task_id);
    }
  },
  {
    name: 'openbridge_list_active_tasks',
    description: 'Lista todas las tareas asincronas activas o recientes en el gestor de enjambres de OpenBridge.',
    parameters: z.object({
      limit: z.number().optional().default(20).describe('Cantidad maxima de tareas a listar')
    }),
    execute: async (args) => {
      return jobManager.listJobs(args.limit);
    }
  },
  {
    name: 'openbridge_get_diff',
    description: 'Recupera los diffs de Git o archivos generados durante una sesion previa en OpenCode.',
    parameters: z.object({
      session_id: z.string().describe('ID de la sesion de OpenCode')
    }),
    execute: async (args) => {
      const diffs = await client.getSessionDiff(args.session_id);
      return {
        sessionID: args.session_id,
        diffs
      };
    }
  },
  {
    name: 'openbridge_status',
    description: 'Verifica el estado del daemon local de OpenCode, la conectividad y el transporte SSE.',
    parameters: z.object({}),
    execute: async () => {
      const auth = await checkServerAuth();
      return {
        serverUrl: `http://${CONFIG.hostname}:${CONFIG.port}`,
        status: auth.ok ? 'ONLINE' : 'OFFLINE',
        defaultModel: CONFIG.defaultModel,
        multimodalModel: CONFIG.multimodalModel,
        details: auth.data || auth.error || 'Running'
      };
    }
  }
];
