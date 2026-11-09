import assert from 'node:assert';
import { jobManager } from '../src/job-manager.js';

console.log('--- TEST SUITE: OpenBridge Auto-Handoff Preventivo ---');

async function runTests() {
  // Test 1: Fast job completion resolution
  const mockJobId1 = 'job_fast_123';
  jobManager.jobs.set(mockJobId1, {
    jobId: mockJobId1,
    status: 'RUNNING',
    startedAt: Date.now()
  });

  const waitPromise1 = jobManager.waitForJob(mockJobId1, 1000);

  // Simular que el job se completa en 50ms
  setTimeout(() => {
    const job = jobManager.jobs.get(mockJobId1);
    job.status = 'COMPLETED';
    job.outcome = 'succeeded';
    job.durationSeconds = 1;
    jobManager.emit('task_completed', job);
  }, 50);

  const res1 = await waitPromise1;
  assert.strictEqual(res1.done, true, 'Debe indicar done: true para tareas rápidas');
  assert.strictEqual(res1.job.status, 'COMPLETED');
  console.log('  ok   fast-job: resolución síncrona inmediata antes del timeout');

  // Test 2: Auto-Handoff por exceder el tiempo síncrono
  const mockJobId2 = 'job_slow_deepseek';
  jobManager.jobs.set(mockJobId2, {
    jobId: mockJobId2,
    status: 'RUNNING',
    model: 'opencode/deepseek-v4.1-flash-free',
    startedAt: Date.now()
  });

  // Limite síncrono configurado a 150ms para la prueba
  const res2 = await jobManager.waitForJob(mockJobId2, 150);
  assert.strictEqual(res2.handoff, true, 'Debe activar handoff: true al expirar el tiempo síncrono');
  assert.strictEqual(res2.job.jobId, mockJobId2);
  assert.strictEqual(res2.job.status, 'RUNNING');
  console.log('  ok   auto-handoff: transferencia transparente a background sin error');

  // Test 3: Fallo controlado
  const mockJobId3 = 'job_fail_test';
  jobManager.jobs.set(mockJobId3, {
    jobId: mockJobId3,
    status: 'RUNNING',
    startedAt: Date.now()
  });

  const waitPromise3 = jobManager.waitForJob(mockJobId3, 500);
  setTimeout(() => {
    const job = jobManager.jobs.get(mockJobId3);
    job.status = 'FAILED';
    job.error = 'Simulated engine failure';
    jobManager.emit('task_failed', job);
  }, 50);

  await assert.rejects(waitPromise3, /Simulated engine failure/, 'Debe rechazar con el error adecuado');
  console.log('  ok   error-handling: captura determinista de excepciones');

  console.log('\n[PASS] Todas las pruebas de Auto-Handoff superadas con éxito.');
}

runTests().catch(err => {
  console.error('[FAIL] Error en la prueba:', err);
  process.exit(1);
});
