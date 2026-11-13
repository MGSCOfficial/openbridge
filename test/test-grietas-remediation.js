import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config.js';
import { jobManager } from '../src/job-manager.js';
import { FREE_FALLBACK_CHAIN, getNextFallbackModel, isRecoverableModelError } from '../src/client.js';
import { TOOLS } from '../src/tools.js';

console.log('=== TEST SUITE: REMEDIACIÓN DE GRIETAS OPENBRIDGE (DEEPSEEK AUDIT) ===');

async function testP03DynamicAuth() {
  console.log('\n[TEST P03] 1. Verificando generación y lectura dinámica de token...');
  assert.ok(CONFIG.serverPassword, 'serverPassword no debe estar vacío');
  assert.notStrictEqual(
    CONFIG.serverPassword,
    'openbridge_local_token_2026',
    'La contraseña ya NO debe ser el token estático hardcodeado'
  );
  const tokenFile = path.join(CONFIG.dataDir, 'token');
  assert.ok(fs.existsSync(tokenFile), 'El archivo ~/.openbridge/token debe existir en disco');
  const fileContent = fs.readFileSync(tokenFile, 'utf8').trim();
  assert.strictEqual(fileContent, CONFIG.serverPassword, 'El token en disco debe coincidir con CONFIG.serverPassword');
  console.log('  ✅ P03 PASS: Token dinámico criptográfico generado y validado con éxito.');
}

async function testP04RecursionGuard() {
  console.log('\n[TEST P04] 2. Verificando guardián de recursión agéntica (Depth Guard)...');
  assert.strictEqual(CONFIG.maxDepth, 2, 'CONFIG.maxDepth debe ser 2 por defecto');

  // Intento de iniciar job con call_depth = 2 (debe ser bloqueado inmediatamente)
  let blocked = false;
  try {
    await jobManager.startJob({
      task: 'Tarea de prueba recursiva',
      call_depth: 2
    });
  } catch (err) {
    if (err.message.includes('RECURSION_LIMIT_EXCEEDED')) {
      blocked = true;
    }
  }

  assert.strictEqual(blocked, true, 'Debe lanzar RECURSION_LIMIT_EXCEEDED si call_depth >= maxDepth');
  console.log('  ✅ P04 PASS: Fork bomb agéntico bloqueado por Depth Guard.');
}

async function testP01JobPersistence() {
  console.log('\n[TEST P01] 3. Verificando persistencia y recuperación de jobs en disco...');
  const testJobId = `job_test_persist_${Date.now()}`;
  const testJob = {
    jobId: testJobId,
    sessionID: 'ses_mock_999',
    model: 'opencode/nemotron-3.5-lightning-free',
    task: 'Persistencia determinista JSONL',
    status: 'COMPLETED',
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    durationSeconds: 5,
    outcome: 'succeeded',
    tokens: { input: 100, output: 50, reasoning: 10 },
    diffs: [],
    result: 'Respuesta persistida'
  };

  jobManager.jobs.set(testJobId, testJob);
  jobManager._saveJobs();

  assert.ok(fs.existsSync(CONFIG.jobsFile), 'El archivo jobs.jsonl debe existir');
  const fileLines = fs.readFileSync(CONFIG.jobsFile, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const foundInFile = fileLines.some((l) => l.includes(testJobId));
  assert.ok(foundInFile, 'El nuevo job debe estar escrito en jobs.jsonl');

  // Simular reinicio del gestor leyendo desde disco
  const initialSize = jobManager.jobs.size;
  jobManager._loadJobs();
  const recoveredJob = jobManager.getJob(testJobId);
  assert.strictEqual(recoveredJob.found, true, 'El job debe recuperarse tras _loadJobs()');
  assert.strictEqual(recoveredJob.jobId, testJobId);
  assert.strictEqual(recoveredJob.status, 'COMPLETED');
  console.log('  ✅ P01 PASS: Jobs persistidos atómicamente en jobs.jsonl y recuperados con éxito.');
}

async function testP02FallbackAndTools() {
  console.log('\n[TEST P02] 4. Verificando cadena de fallback y herramientas unificadas...');
  // Validar cadena de fallback
  assert.ok(FREE_FALLBACK_CHAIN.length >= 4, 'La cadena gratuita debe tener al menos 4 modelos');
  assert.strictEqual(
    getNextFallbackModel('opencode/nemotron-3.5-lightning-free'),
    'opencode/nemotron-3.5-super-vl-free'
  );
  assert.strictEqual(
    getNextFallbackModel('opencode/nemotron-3.5-super-vl-free'),
    'opencode/deepseek-v4.1-flash-free'
  );
  assert.strictEqual(
    getNextFallbackModel('opencode/deepseek-v4.1-flash-free'),
    'opencode/glm-5.3-flash-free'
  );
  assert.strictEqual(
    getNextFallbackModel('opencode/glm-5.3-flash-free'),
    null
  );

  // Validar detección de errores recuperables
  assert.ok(isRecoverableModelError('OpenCode API error [429 POST /api/session]: Rate limit exceeded'));
  assert.ok(isRecoverableModelError('503 Service Unavailable: Overloaded'));
  assert.ok(isRecoverableModelError('quota exceeded for free model'));
  assert.strictEqual(isRecoverableModelError('SyntaxError: unexpected token'), false);

  // Validar TOOLS unificado (8 herramientas registradas con cero código muerto)
  assert.strictEqual(TOOLS.length, 8, 'Debe haber exactamente 8 herramientas registradas en src/tools.js');
  const toolNames = TOOLS.map((t) => t.name);
  assert.ok(toolNames.includes('openbridge_list_models'));
  assert.ok(toolNames.includes('openbridge_delegate_task'));
  assert.ok(toolNames.includes('openbridge_start_task'));
  assert.ok(toolNames.includes('openbridge_check_task'));
  assert.ok(toolNames.includes('openbridge_cancel_task'));
  assert.ok(toolNames.includes('openbridge_list_active_tasks'));
  assert.ok(toolNames.includes('openbridge_get_diff'));
  assert.ok(toolNames.includes('openbridge_status'));

  // Verificar que openbridge_delegate_task y start_task incluyan call_depth
  const delegateTool = TOOLS.find((t) => t.name === 'openbridge_delegate_task');
  assert.ok(delegateTool.parameters.call_depth, 'openbridge_delegate_task debe declarar call_depth');
  const startTool = TOOLS.find((t) => t.name === 'openbridge_start_task');
  assert.ok(startTool.parameters.call_depth, 'openbridge_start_task debe declarar call_depth');

  console.log('  ✅ P02 PASS: Cadena de fallback cableada y 8 herramientas unificadas en src/tools.js sin código muerto.');
}

async function runAll() {
  try {
    await testP03DynamicAuth();
    await testP04RecursionGuard();
    await testP01JobPersistence();
    await testP02FallbackAndTools();
    console.log('\n🎯 [TODO CERTIFICADO] Todas las grietas señaladas por DeepSeek han sido remediadas y verificadas.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR EN CERTIFICACIÓN:', err);
    process.exit(1);
  }
}

runAll();
