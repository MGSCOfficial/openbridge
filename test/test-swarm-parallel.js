import { jobManager } from '../src/job-manager.js';

async function run() {
  console.log('[TEST-SWARM] Iniciando prueba de enjambre multiagente concurrente...');

  const workers = [
    {
      name: 'Worker 1 (Nemotron 3.5 Lightning)',
      model: 'opencode/nemotron-3.5-lightning-free',
      task: 'Calcula 25 * 4. Responde unicamente con el numero del resultado y la palabra NEMO_LIGHTNING.'
    },
    {
      name: 'Worker 2 (Nemotron 3.5 Super VL)',
      model: 'opencode/nemotron-3.5-super-vl-free',
      task: 'Calcula 50 * 2. Responde unicamente con el numero del resultado y la palabra NEMO_SUPER_VL.'
    },
    {
      name: 'Worker 3 (DeepSeek V4.1 Flash)',
      model: 'opencode/deepseek-v4.1-flash-free',
      task: 'Calcula 100 * 1. Responde unicamente con el numero del resultado y la palabra DEEPSEEK_FLASH.'
    }
  ];

  try {
    const tStart = Date.now();
    console.log('[TEST-SWARM] Disparando 3 workers en paralelo de forma asíncrona no bloqueante...');

    // 1. Dispatch all 3 jobs concurrently
    const startPromises = workers.map((w) =>
      jobManager.startJob({
        task: w.task,
        model: w.model,
        read_only: true,
        timeout_seconds: 60
      })
    );

    const launchedJobs = await Promise.all(startPromises);
    const dispatchDuration = Date.now() - tStart;

    console.log(`[TEST-SWARM] 🚀 3 tareas disparadas en paralelo en ${dispatchDuration}ms!`);
    launchedJobs.forEach((j, i) => {
      console.log(`  • ${workers[i].name} ➔ Job ID: ${j.jobId} (Status: ${j.status})`);
    });

    if (dispatchDuration > 3000) {
      console.warn('[TEST-SWARM] Advertencia: El disparo inicial tardó más de lo esperado:', dispatchDuration);
    }

    // 2. Poll jobs until completion
    console.log('[TEST-SWARM] Esperando resolución concurrente de todos los workers...');
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

    const totalSwarmTime = Date.now() - tStart;
    console.log(`\n[TEST-SWARM] Enjambre finalizado en ${Math.round(totalSwarmTime / 1000)}s! Resultados:`);

    let successCount = 0;
    for (let i = 0; i < launchedJobs.length; i++) {
      const j = launchedJobs[i];
      const res = completedResults[j.jobId];
      console.log(`\n--- ${workers[i].name} ---`);
      if (res && res.status === 'COMPLETED') {
        successCount++;
        console.log('  • Estado: COMPLETED');
        console.log('  • Duración:', `${res.durationSeconds}s`);
        console.log('  • Tokens:', res.tokens);
        console.log('  • Respuesta:', res.response.trim());
      } else {
        console.error('  • Estado:', res?.status || 'TIMEOUT');
        console.error('  • Error:', res?.error || 'No response in time');
      }
    }

    if (successCount >= 2) {
      console.log(`\n✅ [SWARM PASS] Enjambre multiagente verificado con éxito (${successCount}/3 workers completaron en paralelo).`);
      process.exit(0);
    } else {
      throw new Error(`Enjambre falló con solo ${successCount}/3 workers completados.`);
    }
  } catch (err) {
    console.error('❌ [SWARM FAIL]:', err.message);
    process.exit(1);
  }
}

run();
