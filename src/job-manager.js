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

  _prunePayloads() {
    if (!CONFIG.payloadsDir || !fs.existsSync(CONFIG.payloadsDir)) return;
    // La purga recorre el directorio: no hace falta en cada guardado.
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

  /**
   * Retención acotada: sin esto, jobs.jsonl crece indefinidamente y _loadJobs
   * parsea todo el histórico en cada arranque. Nunca elimina jobs RUNNING.
   */
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
          // El payload se escribe una vez (al completar o al encontrar el job
          // cargado sin payload). Reescribirlo en cada guardado multiplicaba el
          // I/O por el número de jobs retenidos.
          if (CONFIG.payloadsDir && (j.result || j.diffs?.length > 0)) {
            const payloadPath = path.join(CONFIG.payloadsDir, `${j.jobId}.json`);
            if (!fs.existsSync(payloadPath)) {
              this._savePayload(j.jobId, {
                promptText: j.promptText,
                result: j.result,
                diffs: j.diffs,
                savedAt: Date.now()
              });
            }
          }
          const record = { ...j };
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
          this._trackJobBackground(job, 600, recoverDir, job.promptText || '');
          continue;
        }

        const result = await client.waitForCompletion(job.sessionID, 5000).catch(() => null);
        if (!result) {
          throw new Error('[RECOVERY_INCOMPLETE] La sesión está idle pero no se pudo recolectar el resultado');
        }

        job.status = 'COMPLETED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.outcome = result.outcome;
        job.modelUsed = result.model?.id || job.model;
        job.tokens = result.tokens;
        job.diffs = result.diffs || [];
        job.result = result.text;
        recordModelSuccess(job.modelUsed || job.model);
        this._savePayload(job.jobId, {
          promptText: job.promptText,
          result: job.result,
          diffs: job.diffs,
          completedAt: job.completedAt
        });
      } catch (err) {
        job.status = 'FAILED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - (job.startedAt || job.completedAt)) / 1000);
        job.error = `Recuperación post-reinicio: ${err.message}`;
      }
    }
    this._saveJobs();
  }

  async startJob(options) {
    const {
      task,
      model = CONFIG.defaultModel,
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

    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const effectiveDir = working_dir || (read_only ? createSandbox(jobId) : null);

    let promptText = task;
    if (read_only) {
      promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCION, CODIGO O ANALISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${task}`;
    }
    if (declaredDepth > 0) {
      promptText = `[OPENBRIDGE_RECURSION_DEPTH: ${declaredDepth}]\n${promptText}`;
    }

    let activeModel = model;

    // Circuit Breaker: si el modelo objetivo está en enfriamiento, conmutar proactivamente
    if (isModelInCooldown(activeModel)) {
      const nextHealthy = getNextFallbackModel(activeModel);
      if (nextHealthy && nextHealthy !== activeModel) {
        console.warn(
          `[Circuit Breaker] Modelo ${activeModel} en cooldown. Conmutando proactivamente a ${nextHealthy}...`
        );
        activeModel = nextHealthy;
      }
    }

    let sessionID = null;

    while (!sessionID) {
      let candidateSessionID = null;
      try {
        candidateSessionID = await client.createSession({
          title: `openbridge-${jobId}`,
          model: activeModel,
          directory: effectiveDir
        });
        await client.sendPrompt(candidateSessionID, promptText);
        sessionID = candidateSessionID;
      } catch (err) {
        if (candidateSessionID) {
          await client.interruptSession(candidateSessionID).catch(() => {});
        }
        recordModelFailure(activeModel, isRecoverableModelError(err));
        const nextModel = getNextFallbackModel(activeModel);
        if (nextModel && isRecoverableModelError(err)) {
          console.warn(
            `[OpenBridge Fallback] Modelo ${activeModel} falló en create/send (${err.message}). Conmutando a ${nextModel}...`
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

    const job = {
      jobId,
      sessionID,
      model: activeModel,
      initialModel: model,
      task: task.slice(0, 100) + (task.length > 100 ? '...' : ''),
      promptText,
      readOnly: read_only,
      sandboxDir: read_only ? effectiveDir : null,
      callDepth: declaredDepth,
      status: 'RUNNING',
      startedAt: Date.now(),
      completedAt: null,
      durationSeconds: 0,
      outcome: null,
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
      model: activeModel,
      status: 'RUNNING',
      startedAt: new Date(job.startedAt).toISOString(),
      callDepth: declaredDepth,
      message: 'Tarea iniciada en segundo plano con éxito'
    };
  }

  _trackJobBackground(job, timeoutSeconds = 600, effectiveDir = null, promptText = '') {
    (async () => {
      try {
        const timeoutMs = (timeoutSeconds || 600) * 1000;
        const result = await client.waitForCompletion(job.sessionID, timeoutMs);

        job.status = 'COMPLETED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.outcome = result.outcome;
        job.modelUsed = result.model?.id || job.model;
        job.tokens = result.tokens;
        job.diffs = result.diffs || [];
        job.result = result.text;
        recordModelSuccess(job.modelUsed || job.model);
        this._savePayload(job.jobId, {
          promptText: job.promptText,
          result: job.result,
          diffs: job.diffs,
          completedAt: job.completedAt
        });
        this.emit('task_completed', job);
      } catch (err) {
        recordModelFailure(job.model, isRecoverableModelError(err));
        const nextModel = getNextFallbackModel(job.model);
        if (nextModel && isRecoverableModelError(err) && !job.fallbackAttempted) {
          job.fallbackAttempted = true;
          job.fallbackFrom = job.model;
          job.model = nextModel;
          console.warn(`[OpenBridge Fallback Runtime] Conmutando ${job.fallbackFrom} -> ${nextModel} para job ${job.jobId}`);
          try {
            const newSessionID = await client.createSession({
              title: `openbridge-${job.jobId}-fallback`,
              model: nextModel,
              directory: job.sandboxDir || effectiveDir
            });
            job.sessionID = newSessionID;
            await client.sendPrompt(newSessionID, promptText || job.promptText || job.task);
            return this._trackJobBackground(job, timeoutSeconds, effectiveDir, promptText);
          } catch (fallbackErr) {
            err = fallbackErr;
          }
        }

        job.status = 'FAILED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.error = err.message;
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
    const effectiveDiffs = (job.diffs && job.diffs.length > 0) ? job.diffs : (payload?.diffs || []);

    const currentDuration = job.completedAt
      ? job.durationSeconds
      : Math.round((Date.now() - job.startedAt) / 1000);

    return {
      found: true,
      jobId: job.jobId,
      sessionID: job.sessionID,
      model: job.modelUsed || job.model,
      initialModel: job.initialModel || job.model,
      fallbackFrom: job.fallbackFrom || null,
      callDepth: job.callDepth || 0,
      status: job.status,
      durationSeconds: currentDuration,
      outcome: job.outcome,
      tokens: job.tokens,
      costUsd: 0,
      geminiQuotaSaved: '100%',
      diffsCount: effectiveDiffs.length,
      diffs: effectiveDiffs,
      response: effectiveResult,
      error: job.error
    };
  }

  listJobs(limit = 20) {
    const list = Array.from(this.jobs.values())
      .slice(-limit)
      .reverse()
      .map((j) => ({
        jobId: j.jobId,
        sessionID: j.sessionID,
        model: j.model,
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
      jobId,
      status: 'CANCELLED',
      message: `Tarea ${jobId} interrumpida correctamente`
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
