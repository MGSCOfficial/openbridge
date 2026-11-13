import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { client, getNextFallbackModel, isRecoverableModelError } from './client.js';
import { CONFIG } from './config.js';
import { createSandbox, cleanupSandbox } from './sandbox-manager.js';

class JobManager extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this._loadJobs();
    this.recoverPendingJobs().catch(() => {});
  }

  _saveJobs() {
    try {
      if (!CONFIG.jobsFile) return;
      const tmpFile = `${CONFIG.jobsFile}.tmp`;
      const lines = Array.from(this.jobs.values())
        .map((j) => JSON.stringify(j))
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
      if (job.status === 'RUNNING') {
        try {
          const session = await client.request(`/api/session/${job.sessionID}`);
          if (session && session.time?.idle && (!session.time.busy || session.time.idle >= session.time.busy)) {
            const result = await client.waitForCompletion(job.sessionID, 5000).catch(() => null);
            if (result) {
              job.status = 'COMPLETED';
              job.completedAt = Date.now();
              job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
              job.outcome = result.outcome;
              job.modelUsed = result.model?.id || job.model;
              job.tokens = result.tokens;
              job.diffs = result.diffs || [];
              job.result = result.text;
            } else {
              job.status = 'COMPLETED';
              job.completedAt = Date.now();
            }
          } else {
            this._trackJobBackground(job, 600);
          }
        } catch (err) {
          job.status = 'FAILED';
          job.completedAt = Date.now();
          job.error = `Recuperación post-reinicio: ${err.message}`;
        }
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

    // P04: Guardián de Recursión Agéntica (Depth Guard)
    if (call_depth >= CONFIG.maxDepth) {
      throw new Error(
        `[RECURSION_LIMIT_EXCEEDED] Profundidad máxima de delegación alcanzada (${call_depth} >= ${CONFIG.maxDepth}). Prohibida la auto-delegación recursiva para prevenir fork bombs.`
      );
    }

    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const effectiveDir = working_dir || (read_only ? createSandbox(jobId) : null);

    let promptText = task;
    if (read_only) {
      promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCION, CODIGO O ANALISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${task}`;
    }
    if (call_depth > 0) {
      promptText = `[OPENBRIDGE_RECURSION_DEPTH: ${call_depth}]\n${promptText}`;
    }

    let activeModel = model;
    let sessionID = null;

    // P02: Intentar crear sesión y despachar prompt con fallback automático
    while (!sessionID) {
      try {
        sessionID = await client.createSession({
          title: `openbridge-${jobId}`,
          model: activeModel,
          directory: effectiveDir
        });
        await client.sendPrompt(sessionID, promptText);
      } catch (err) {
        const nextModel = getNextFallbackModel(activeModel);
        if (nextModel && isRecoverableModelError(err)) {
          console.warn(`[OpenBridge Fallback] Modelo ${activeModel} falló (${err.message}). Conmutando a ${nextModel}...`);
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
      readOnly: read_only,
      sandboxDir: read_only ? effectiveDir : null,
      callDepth: call_depth,
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
      callDepth: call_depth,
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
        this.emit('task_completed', job);
      } catch (err) {
        // P02: Fallback durante la ejecución
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
            await client.sendPrompt(newSessionID, promptText || job.task);
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
      diffsCount: job.diffs?.length || 0,
      diffs: job.diffs,
      response: job.result,
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
