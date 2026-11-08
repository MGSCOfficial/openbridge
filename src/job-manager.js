import { randomUUID } from 'node:crypto';
import { client } from './client.js';
import { CONFIG } from './config.js';
import { createSandbox, cleanupSandbox } from './sandbox-manager.js';

class JobManager {
  constructor() {
    this.jobs = new Map();
  }

  async startJob(options) {
    const {
      task,
      model = CONFIG.defaultModel,
      working_dir = null,
      read_only = false,
      timeout_seconds = 120
    } = options;

    const jobId = `job_${randomUUID().slice(0, 8)}`;
    const effectiveDir = working_dir || (read_only ? createSandbox(jobId) : null);

    let promptText = task;
    if (read_only) {
      promptText = `[MODO SOLO LECTURA: NO MODIFIQUES NI CREES ARCHIVOS EN DISCO. DEVUELVE TU SOLUCION, CODIGO O ANALISIS EN TEXTO PLANO DENTRO DE TU RESPUESTA]\n\n${task}`;
    }

    // 1. Create OpenCode session
    const sessionID = await client.createSession({
      title: `openbridge-${jobId}`,
      model,
      directory: effectiveDir
    });

    const job = {
      jobId,
      sessionID,
      model,
      task: task.slice(0, 100) + (task.length > 100 ? '...' : ''),
      readOnly: read_only,
      sandboxDir: read_only ? effectiveDir : null,
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

    // 2. Dispatch prompt
    await client.sendPrompt(sessionID, promptText);

    // 3. Track in background asynchronously (fire-and-forget for Antigravity)
    (async () => {
      try {
        const timeoutMs = (timeout_seconds || 120) * 1000;
        const result = await client.waitForCompletion(sessionID, timeoutMs);

        job.status = 'COMPLETED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.outcome = result.outcome;
        job.modelUsed = result.model?.id || model;
        job.tokens = result.tokens;
        job.diffs = result.diffs || [];
        job.result = result.text;
      } catch (err) {
        job.status = 'FAILED';
        job.completedAt = Date.now();
        job.durationSeconds = Math.round((job.completedAt - job.startedAt) / 1000);
        job.error = err.message;
      } finally {
        if (job.sandboxDir) {
          cleanupSandbox(jobId);
        }
      }
    })().catch(() => {});

    return {
      jobId,
      sessionID,
      model,
      status: 'RUNNING',
      startedAt: new Date(job.startedAt).toISOString(),
      message: 'Tarea iniciada en segundo plano con éxito'
    };
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
      status: job.status,
      durationSeconds: currentDuration,
      outcome: job.outcome,
      tokens: job.tokens,
      costUsd: 0,
      geminiQuotaSaved: '100%',
      diffsCount: job.diffs.length,
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

    return {
      jobId,
      status: 'CANCELLED',
      message: `Tarea ${jobId} interrumpida correctamente`
    };
  }
}

export const jobManager = new JobManager();
