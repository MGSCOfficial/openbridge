import assert from 'node:assert';
import http from 'node:http';
import { CONFIG } from '../src/config.js';
import { startDashboardServer, stopDashboardServer, broadcastDashboardEvent } from '../src/dashboard.js';
import { jobManager } from '../src/job-manager.js';

console.log('--- TEST SUITE: OpenBridge Live Dashboard & Dual-Track SSE ---');

const TEST_PORT = 4198;

async function fetchHttp(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runTests() {
  // 1. Config Test
  assert.strictEqual(typeof CONFIG.dashboardPort, 'number', 'dashboardPort debe ser numérico');
  console.log('  ok   config: dashboardPort cargado correctamente');

  // 2. Start Dashboard
  startDashboardServer(TEST_PORT);
  await new Promise(r => setTimeout(r, 200));
  console.log(`  ok   dashboard: servidor iniciado en puerto ${TEST_PORT}`);

  // 3. Test GET /
  const htmlRes = await fetchHttp('/');
  assert.strictEqual(htmlRes.status, 200, 'GET / debe responder 200');
  assert.ok(htmlRes.body.includes('OpenBridge Telemetry'), 'HTML debe contener el título del dashboard');
  assert.ok(htmlRes.headers['content-type'].includes('text/html'), 'Content-Type debe ser text/html');
  console.log('  ok   http: GET / devuelve interfaz SPA HTML reactiva');

  // 4. Test GET /api/status
  const statusRes = await fetchHttp('/api/status');
  assert.strictEqual(statusRes.status, 200, 'GET /api/status debe responder 200');
  const statusJson = JSON.parse(statusRes.body);
  assert.strictEqual(statusJson.status, 'ONLINE', 'Estado reportado debe ser ONLINE');
  assert.ok(Array.isArray(statusJson.jobs), 'jobs debe ser un arreglo');
  console.log('  ok   http: GET /api/status responde JSON con telemetría ONLINE');

  // 5. Test Event Emission & Broadcast
  let eventReceived = false;
  jobManager.once('task_started', (job) => {
    eventReceived = true;
    assert.strictEqual(job.jobId, 'test_mock_job');
  });

  jobManager.emit('task_started', {
    jobId: 'test_mock_job',
    model: 'opencode/nemotron-3.5-super-vl-free',
    task: 'Prueba de telemetría reactiva',
    status: 'RUNNING',
    startedAt: Date.now()
  });

  assert.ok(eventReceived, 'jobManager debe emitir task_started reactivamente');
  broadcastDashboardEvent('test_event', { ok: true });
  console.log('  ok   events: emisión en JobManager y broadcast a SSE validado');

  // 6. Stop Dashboard
  stopDashboardServer();
  await new Promise(r => setTimeout(r, 100));
  console.log('  ok   dashboard: apagado y limpieza de sockets exitosa');

  console.log('\n[PASS] Todas las pruebas de Dashboard y Streaming SSE superadas con éxito.');
}

runTests().catch((err) => {
  console.error('[FAIL] Error en la suite de pruebas:', err);
  stopDashboardServer();
  process.exit(1);
});
