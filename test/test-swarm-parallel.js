import { client } from '../src/client.js';
import { jobManager } from '../src/job-manager.js';

async function run() {
  console.log('[TEST-SWARM] Iniciando prueba de ejecución paralela descentralizada...');

  try {
    const models = await client.listModels({ freeOnly: true });
    const fallbackPool = models.length > 0 ? models : await client.listModels();
    if (fallbackPool.length === 0) {
      throw new Error('No hay modelos disponibles en OpenCode para probar el enjambre.');
    }

    const chosen = [0, 1, 2].map((i) => fallbackPool[i % fallbackPool.length].fullId);
    const workers = chosen.map((model, idx) => ({
      name: `Worker ${idx + 1} (${model})`,
      model,
      task: `Calcula ${(idx + 1) * 10} + 5. Responde unicamente con el numero del resultado.`
    }));

    const tStart = Date.now();
    const launchedJobs = await Promise.all(
      workers.map((w) => jobManager.startJob({ task: w.task, model: w.model, read_only: true, timeout_seconds: 60 }))
    );

    const maxWaitMs = 60000;
    const pollStart = Date.now();
    const completedResults = {};

    while (Date.now() - pollStart < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 1000));
      let allDone = true;
      for (const j of launchedJobs) {
        if (!completedResults[j.jobId]) {
          const status = jobManager.getJob(j.jobId);
          if (status.status === 'COMPLETED' || status.status === 'FAILED') {
            completedResults[j.jobId] = status;
          } else {
            allDone = false;
          }
        }
      }
      if (allDone) break;
    }

    let successCount = 0;
    for (let i = 0; i < launchedJobs.length; i++) {
      const res = completedResults[launchedJobs[i].jobId];
      if (res?.status === 'COMPLETED') successCount++;
    }

    const totalSwarmTime = Math.round((Date.now() - tStart) / 1000);
    if (successCount >= 2) {
      console.log(`✅ [SWARM PASS] ${successCount}/3 workers completaron en paralelo en ${totalSwarmTime}s.`);
      process.exit(0);
    }
    throw new Error(`Enjambre falló con solo ${successCount}/3 workers completados.`);
  } catch (err) {
    console.error('❌ [SWARM FAIL]:', err.message);
    process.exit(1);
  }
}

run();
