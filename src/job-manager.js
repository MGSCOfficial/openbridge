import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  client,
  getNextFallbackModel,
  isRecoverableModelError,
  recordModelFailure,
  recordModelSuccess,
  isModelInCooldown
} from './client.js';
import { CONFIG } from './config.js';
import { createSandbox, cleanupSandbox } from './sandbox-manager.js';

class JobManager extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this._lastPayloadPrune = 0;
    this._loadJobs();
    this.recoverPendingJobs().catch(() => {});
  }

  _ensurePayloadsDir() {
    if (CONFIG.payloadsDir && !fs.existsSync(CONFIG.payloadsDir)) {
      try {
        fs.mkdirSync(CONFIG.payloadsDir, { recursive: true });
      } catch {}
    }
  }

  _savePayload(jobId, payload) {
    if (!CONFIG.payloadsDir) return;
    try {
      this._ensurePayloadsDir();
      const filePath = path.join(CONFIG.payloadsDir, `${jobId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error(`[JobManager] Error al guardar payload para ${jobId}:`, err.message);
    }
  }

  _loadPayload(jobId) {
    if (!CONFIG.payloadsDir) return null;
    const filePath = path.join(CONFIG.payloadsDir, `${jobId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  _getFullPrompt(job) {
    return job.promptText || this._loadPayload(job.jobId)?.promptText || job.promptPreview || job.task;
  }

  _prunePayloads() {
    if (!CONFIG.payloadsDir || !fs.existsSync(CONFIG.payloadsDir)) return;
    if (Date.now() - this._lastPayloadPrune < 10 * 60 * 1000) return;
    this._lastPayloadPrune = Date.now();
    try {
      const ttlMs = (CONFIG.payloadTtlDays || 7) * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const files = fs.readdirSync(CONFIG.payloadsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(CONFIG.payloadsDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > ttlMs) {
            const jobId = file.replace('.json', '');
            const job = this.jobs.get(jobId);
            if (!job || job.status !== 'RUNNING') {
              fs.unlinkSync(filePath);
            }
          }
        } catch {}
      }
    } catch (err) {
      console.error('[JobManager] Error al purgar payloads antiguos:', err.message);
    }
  }

  _pruneJobs() {
    const max = CONFIG.jobsRetention;
    if (!max || this.jobs.size <= max) return;
    const removable = Array.from(this.jobs.values())
      .filter((j) => j.status !== 'RUNNING')
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    for (const job of removable) {
      if (this.jobs.size <= max) break;
      this.jobs.delete(job.jobId);
    }
  }

  _saveJobs() {
    this._pruneJobs();
    this._prunePayloads();
    try {
      if (!CONFIG.jobsFile) return;
      const tmpFile = `${CONFIG.jobsFile}.tmp`;
      const lines = Array.from(this.jobs.values())
        .map((j) => {
          const hasLargePrompt = Boolean(j.promptText && j.promptText.length > 300);
          if (CONFIG.payloadsDir && (j.result || j.diffs?.length > 0 || hasLargePrompt)) {
            const payloadPath = path.join(CONFIG.payloadsDir, `${j.jobId}.json`);
            if (!fs.existsSync(payloadPath)) {
              this._savePayload(j.jobId, {
                promptText: j.promptText || this._getFullPrompt(j),
                result: j.result,
                diffs: j.diffs,
                savedAt: Date.now()
              });
            }
          }
          const record = { ...j };
          if (hasLargePrompt) {
            record.promptPreview = record.promptText.slice(0, 300) + '...';
            delete record.promptText;
          }
          if (record.result && record.result.length > 300) {
            record.resultPreview = record.result.slice(0, 300) + '...';
            delete record.result;
          }
          if (record.diffs && record.diffs.length > 5) {
            record.diffsCount = record.diffs.length;
            record.diffs = record.diffs.slice(0, 5);
          }
          return JSON.stringify(record);
        })
        .join('\n');
      fs.writeFileSync(tmpFile, lines, 'utf8');
      fs.renameSync(tmpFile, CONFIG.jobsFile);
    } catch {
      try {
        fs.writeFileSync(
          CONFIG.jobsFile,
          Array.from(this.jobs.values())
            .map((j) => JSON.stringify(j))
            .join('\n'),
          'utf8'
        );
      } catch (writeErr) {
        console.error('[JobManager] Error al persistir jobs en disco:', writeErr.message);
      }
    }
  }

  _loadJobs() {
    if (!CONFIG.jobsFile || !fs.existsSync(CONFIG.jobsFile)) return;
    try {
      const content = fs.readFileSync(CONFIG.jobsFile, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const job = JSON.parse(line);
          if (job && job.jobId) {
            this.jobs.set(job.jobId, job);
          }
        } catch {}
      }
    } catch (err) {
      console.error('[JobManager] Error al cargar jobs persistidos:', err.message);
    }
  }

  async recoverPendingJobs() {
    for (const [, job] of this.jobs.entries()) {
      if (job.status !== 'RUNNING') continue;
      try {
        const session = await client.request(`/api/session/${job.sessionID}`);
        const isIdle = session && session.time?.idle && (!session.time.busy || session.time.idle >= session.time.busy);

        if (!isIdle) {
          const recoverDir = job.sandboxDir && fs.existsSync(job.sandboxDir) ? job.sandboxDir : null;
          this._trackJobBackground(job, 600, recoverDir, this._getFullPrompt(job));
          continue;
        }

        let result = null;
        try {
          result = await client.waitForCompletion(job.sessionID, 5000, job.afterTimestamp || 0);
        } catch (waitErr) {
          if (waitErr?.providerError) {
            job.providerError = waitErr.providerError;
            throw waitErr;
          }
          throw new Error('[RECOVERY_INCOMPLETE] La sesión está idle pero no se pudo recolectar el resultado');
        }

        job.status = 'COMPLETED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.outcome = result.outcome;
        job.modelUsed = result.model
          ? (result.model.providerID ? `${result.model.providerID}/${result.model.id}` : result.model.id)
          : job.model;
        job.tokens = result.tokens;
        job.cost = result.cost ?? null;
        job.diffs = result.diffs || [];
        job.result = result.text;
        recordModelSuccess(job.modelUsed || job.model, job.fallbackModels);
        this._savePayload(job.jobId, {
          promptText: this._getFullPrompt(job),
          result: job.result,
          diffs: job.diffs,
          completedAt: job.completedAt
        });
      } catch (err) {
        job.status = 'FAILED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - (job.startedAt || job.completedAt)) / 1000);
        if (err?.providerError && !job.providerError) {
          job.providerError = err.providerError;
        }
        job.error = job.providerError ? err.message : `Recuperación post-reinicio: ${err.message}`;
      }
    }
    this._saveJobs();
  }

  async startJob(options) {
    const {
      task,
      model = CONFIG.defaultModel,
      agent = null,
      variant = null,
      session_id = null,
      fallback_models = null,
      working_dir = null,
      read_only = false,
      timeout_seconds = 600,
      call_depth = 0
    } = options;

    const declaredDepth = Number.isFinite(call_depth) && call_depth > 0 ? Math.floor(call_depth) : 0;
    if (declaredDepth > 0 && !CONFIG.allowNested) {
      throw new Error(
        '[NESTED_DELEGATION_DISABLED] La delegación desde un worker está deshabilitada por defecto. ' +
          'Un orquestador raíz (call_depth = 0) no se ve afectado. Para habilitarla: OPENBRIDGE_ALLOW_NESTED=1.'
      );
    }
    if (declaredDepth >= CONFIG.maxDepth) {
      throw new Error(
        `[RECURSION_LIMIT_EXCEEDED] Profundidad máxima de delegación alcanzada (${declaredDepth} >= ${CONFIG.maxDepth}). Prohibida la auto-delegación recursiva para prevenir fork bombs.`
      );
    }

    const fallbackChain =
      Array.isArray(fallback_models) && fallback_models.length > 0 ? fallback_models : CONFIG.fallbackModels;

    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const resumedSession = Boolean(session_id);
    const effectiveDir = resumedSession ? null : (working_dir || (read_only ? createSandbox(jobId) : null));

    let promptText = task;
    if (read_only) {
      promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCION, CODIGO O ANALISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${task}`;
    }
    if (declaredDepth > 0) {
      promptText = `[OPENBRIDGE_RECURSION_DEPTH: ${declaredDepth}]\n${promptText}`;
    }

    let activeModel = model || null;
    let sessionID = null;
    let afterTimestamp = 0;

    if (resumedSession) {
      const sentAt = Date.now();
      const promptRes = await client.sendPrompt(session_id, promptText);
      sessionID = session_id;
      afterTimestamp = promptRes?.time?.created || sentAt;
    } else {
      if (activeModel && fallbackChain.length > 0 && isModelInCooldown(activeModel)) {
        const nextHealthy = getNextFallbackModel(activeModel, fallbackChain);
        if (nextHealthy && nextHealthy !== activeModel) {
          console.warn(
            `[Circuit Breaker] Modelo ${activeModel} en cooldown. Conmutando proactivamente a ${nextHealthy}...`
          );
          activeModel = nextHealthy;
        }
      }

      while (!sessionID) {
        let candidateSessionID = null;
        try {
          const sentAt = Date.now();
          candidateSessionID = await client.createSession({
            title: `openbridge-${jobId}`,
            model: activeModel,
            agent,
            variant,
            directory: effectiveDir
          });
          const promptRes = await client.sendPrompt(candidateSessionID, promptText);
          sessionID = candidateSessionID;
          afterTimestamp = promptRes?.time?.created || sentAt;
        } catch (err) {
          if (candidateSessionID) {
            await client.interruptSession(candidateSessionID).catch(() => {});
          }
          if (activeModel) {
            recordModelFailure(activeModel, isRecoverableModelError(err), fallbackChain);
          }
          const nextModel = getNextFallbackModel(activeModel, fallbackChain);
          if (nextModel && isRecoverableModelError(err)) {
            console.warn(
              `[OpenBridge Fallback] Modelo ${activeModel || 'default'} falló en create/send (${err.message}). Conmutando a ${nextModel}...`
            );
            activeModel = nextModel;
          } else {
            if (read_only && effectiveDir) {
              cleanupSandbox(jobId);
            }
            throw err;
          }
        }
      }
    }

    const job = {
      jobId,
      sessionID,
      resumedSession,
      model: activeModel,
      agent: agent || null,
      variant: variant || null,
      initialModel: model || null,
      fallbackModels: fallbackChain,
      afterTimestamp,
      task: task.slice(0, 100) + (task.length > 100 ? '...' : ''),
      promptText,
      readOnly: read_only,
      sandboxDir: !resumedSession && read_only ? effectiveDir : null,
      callDepth: declaredDepth,
      status: 'RUNNING',
      startedAt: Date.now(),
      completedAt: null,
      durationSeconds: 0,
      outcome: null,
      cost: null,
      result: null,
      diffs: [],
      error: null
    };

    this.jobs.set(jobId, job);
    this._saveJobs();
    this.emit('task_started', job);

    this._trackJobBackground(job, timeout_seconds, effectiveDir, promptText);

    return {
      jobId,
      sessionID,
      resumedSession,
      model: activeModel || 'opencode-default',
      agent: agent || null,
      variant: variant || null,
      status: 'RUNNING',
      startedAt: new Date(job.startedAt).toISOString(),
      callDepth: declaredDepth,
      message: resumedSession
        ? `Prompt enviado a la sesión existente ${sessionID}`
        : 'Tarea iniciada en segundo plano con éxito'
    };
  }

  _trackJobBackground(job, timeoutSeconds = 600, effectiveDir = null, promptText = '') {
    (async () => {
      try {
        const timeoutMs = (timeoutSeconds || 600) * 1000;
        const result = await client.waitForCompletion(job.sessionID, timeoutMs, job.afterTimestamp || 0);

        job.status = 'COMPLETED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.outcome = result.outcome;
        job.modelUsed = result.model
          ? (result.model.providerID ? `${result.model.providerID}/${result.model.id}` : result.model.id)
          : job.model;
        job.tokens = result.tokens;
        job.cost = result.cost ?? null;
        job.diffs = result.diffs || [];
        job.result = result.text;
        recordModelSuccess(job.modelUsed || job.model, job.fallbackModels);
        this._savePayload(job.jobId, {
          promptText: promptText || this._getFullPrompt(job),
          result: job.result,
          diffs: job.diffs,
          completedAt: job.completedAt
        });
        this.emit('task_completed', job);
      } catch (err) {
        if (job.model) {
          recordModelFailure(job.model, isRecoverableModelError(err), job.fallbackModels);
        }
        const nextModel = !job.resumedSession ? getNextFallbackModel(job.model, job.fallbackModels) : null;
        if (nextModel && isRecoverableModelError(err) && !job.fallbackAttempted) {
          job.fallbackAttempted = true;
          job.fallbackFrom = job.model;
          job.model = nextModel;
          console.warn(
            `[OpenBridge Fallback Runtime] Conmutando ${job.fallbackFrom || 'default'} -> ${nextModel} para job ${job.jobId}`
          );
          try {
            const sentAt = Date.now();
            const fullPrompt = promptText || this._getFullPrompt(job);
            const newSessionID = await client.createSession({
              title: `openbridge-${job.jobId}-fallback`,
              model: nextModel,
              agent: job.agent || null,
              variant: job.variant || null,
              directory: job.sandboxDir || effectiveDir
            });
            job.sessionID = newSessionID;
            const promptRes = await client.sendPrompt(newSessionID, fullPrompt);
            job.afterTimestamp = promptRes?.time?.created || sentAt;
            return this._trackJobBackground(job, timeoutSeconds, effectiveDir, fullPrompt);
          } catch (fallbackErr) {
            err = fallbackErr;
          }
        }

        job.status = 'FAILED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.error = err.message;
        job.providerError = err.providerError || null;
        this.emit('task_failed', job);
      } finally {
        if (job.status !== 'RUNNING' && job.sandboxDir) {
          cleanupSandbox(job.jobId);
        }
        this._saveJobs();
      }
    })().catch(() => {});
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { found: false, error: `No se encontró la tarea con ID ${jobId}` };
    }

    const payload = this._loadPayload(jobId);
    const effectiveResult = job.result || payload?.result || job.resultPreview || null;
    const effectiveDiffs = job.diffs && job.diffs.length > 0 ? job.diffs : (payload?.diffs || []);

    const currentDuration = job.completedAt
      ? job.durationSeconds
      : Math.round((Date.now() - job.startedAt) / 1000);

    return {
      found: true,
      jobId: job.jobId,
      sessionID: job.sessionID,
      resumedSession: Boolean(job.resumedSession),
      model: job.modelUsed || job.model || 'opencode-default',
      agent: job.agent || null,
      variant: job.variant || null,
      initialModel: job.initialModel || null,
      fallbackFrom: job.fallbackFrom || null,
      callDepth: job.callDepth || 0,
      status: job.status,
      durationSeconds: currentDuration,
      outcome: job.outcome,
      tokens: job.tokens,
      cost: job.cost ?? null,
      diffsCount: effectiveDiffs.length,
      diffs: effectiveDiffs,
      response: effectiveResult,
      error: job.error,
      providerError: job.providerError || null
    };
  }

  listJobs(limit = 20) {
    const list = Array.from(this.jobs.values())
      .slice(-limit)
      .reverse()
      .map((j) => ({
        jobId: j.jobId,
        sessionID: j.sessionID,
        resumedSession: Boolean(j.resumedSession),
        model: j.modelUsed || j.model || 'opencode-default',
        callDepth: j.callDepth || 0,
        status: j.status,
        startedAt: new Date(j.startedAt).toISOString(),
        durationSeconds: j.completedAt
          ? j.durationSeconds
          : Math.round((Date.now() - j.startedAt) / 1000)
      }));

    return {
      total: this.jobs.size,
      jobs: list
    };
  }

  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { found: false, error: `Tarea ${jobId} no encontrada` };
    }

    await client.interruptSession(job.sessionID);
    job.status = 'CANCELLED';
    job.completedAt = Date.now();
    job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);

    if (job.sandboxDir) {
      cleanupSandbox(jobId);
    }

    this._saveJobs();

    return {
      found: true,
      jobId,
      sessionID: job.sessionID,
      status: 'CANCELLED',
      message: `Tarea ${jobId} interrumpida correctamente`
    };
  }

  async cancelSession(sessionID) {
    await client.interruptSession(sessionID);
    const cancelledJobs = [];

    for (const job of this.jobs.values()) {
      if (job.sessionID === sessionID && job.status === 'RUNNING') {
        job.status = 'CANCELLED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        if (job.sandboxDir) {
          cleanupSandbox(job.jobId);
        }
        cancelledJobs.push(job.jobId);
      }
    }

    if (cancelledJobs.length > 0) {
      this._saveJobs();
    }

    return {
      sessionID,
      status: 'CANCELLED',
      cancelledJobs,
      message: `Sesión ${sessionID} interrumpida en OpenCode`
    };
  }

  waitForJob(jobId, timeoutMs = 120000) {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.reject(new Error(`Tarea ${jobId} no encontrada`));
    if (job.status === 'COMPLETED') return Promise.resolve({ done: true, job });
    if (job.status === 'FAILED') return Promise.reject(new Error(job.error || 'La tarea falló'));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve({ handoff: true, job });
      }, timeoutMs);

      const onCompleted = (completedJob) => {
        if (completedJob.jobId === jobId) {
          cleanup();
          resolve({ done: true, job: completedJob });
        }
      };

      const onFailed = (failedJob) => {
        if (failedJob.jobId === jobId) {
          cleanup();
          reject(new Error(failedJob.error || 'La tarea falló'));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off('task_completed', onCompleted);
        this.off('task_failed', onFailed);
      };

      this.on('task_completed', onCompleted);
      this.on('task_failed', onFailed);
    });
  }
}

export const jobManager = new JobManager();
