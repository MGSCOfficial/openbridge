import { z } from 'zod';
import { client } from './client.js';
import { CONFIG } from './config.js';
import { checkServerAuth } from './server-manager.js';

export const TOOLS = [
  {
    name: 'openbridge_list_models',
    description: 'Lista los modelos de IA disponibles a través de OpenCode Zen y OpenRouter, indicando cuáles son 100% gratuitos (como NVIDIA Nemotron 3.5 Lightning Free, Super VL Free, Gemma o DeepSeek Flash).',
    parameters: z.object({
      provider: z.enum(['all', 'opencode', 'openrouter']).optional().default('all').describe('Filtrar por proveedor'),
      free_only: z.boolean().optional().default(true).describe('Mostrar únicamente modelos gratuitos (Coste $0)'),
      search: z.string().optional().default('').describe('Término de búsqueda opcional (ej. nemotron, gemma, flash)')
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
    description: 'Delega una tarea de programación, escaneo o pruebas a un modelo de OpenCode Zen (ej. NVIDIA Nemotron 3.5) de forma asíncrona y estructurada, ahorrando cuota de Gemini en Antigravity.',
    parameters: z.object({
      task: z.string().describe('Instrucción detallada de la tarea que debe realizar el worker externo'),
      model: z.string().optional().default(CONFIG.defaultModel).describe('Modelo objetivo (ej. opencode/nemotron-3.5-lightning-free, opencode/nemotron-3.5-super-vl-free)'),
      working_dir: z.string().optional().describe('Directorio absoluto de trabajo sobre el que debe operar OpenCode. Si se omite, opera en modo de análisis aislado.'),
      read_only: z.boolean().optional().default(false).describe('Si es true, le indica al modelo no alterar archivos en disco y devolver únicamente el análisis o código sugerido.'),
      timeout_seconds: z.number().optional().default(120).describe('Tiempo máximo de espera en segundos')
    }),
    execute: async (args) => {
      let promptText = args.task;
      if (args.read_only) {
        promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCIÓN, CÓDIGO O ANÁLISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${args.task}`;
      }

      // 1. Create session
      const sessionID = await client.createSession({
        title: `openbridge-${Date.now()}`,
        model: args.model || CONFIG.defaultModel,
        directory: args.working_dir || null
      });

      // 2. Dispatch prompt
      await client.sendPrompt(sessionID, promptText);

      // 3. Await completion
      const timeoutMs = (args.timeout_seconds || 120) * 1000;
      const result = await client.waitForCompletion(sessionID, timeoutMs);

      return {
        sessionID: result.sessionID,
        outcome: result.outcome,
        modelUsed: result.model?.id || args.model,
        tokens: result.tokens,
        costUsd: 0,
        quotaSaved: '100% Gemini Quota Offloaded',
        response: result.text,
        diffs: result.diffs,
        durationSeconds: Math.round(result.durationMs / 1000)
      };
    }
  },
  {
    name: 'openbridge_get_diff',
    description: 'Recupera los diffs de Git o archivos generados durante una sesión delegada previa en OpenCode.',
    parameters: z.object({
      session_id: z.string().describe('ID de la sesión de OpenCode')
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
    description: 'Verifica el estado del daemon local de OpenCode, la conectividad y la configuración de autenticación.',
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
