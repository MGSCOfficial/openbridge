import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

const winExePath = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'npm',
  'node_modules',
  '@opencode',
  'cli',
  'bin',
  'opencode.exe'
);

const winCmdPath = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'npm',
  'opencode.cmd'
);

function resolveCliPath() {
  if (process.platform === 'win32') {
    if (fs.existsSync(winExePath)) return winExePath;
    if (fs.existsSync(winCmdPath)) return winCmdPath;
    return 'opencode.cmd';
  }
  return 'opencode';
}

function resolveDataDir() {
  const custom = process.env.OPENBRIDGE_DATA_DIR;
  const dir = custom || path.join(os.homedir(), '.openbridge');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

function resolveServerPassword(dataDir) {
  if (process.env.OPENCODE_SERVER_PASSWORD) {
    return process.env.OPENCODE_SERVER_PASSWORD;
  }
  const tokenFile = path.join(dataDir, 'token');
  if (fs.existsSync(tokenFile)) {
    try {
      const stored = fs.readFileSync(tokenFile, 'utf8').trim();
      if (stored) return stored;
    } catch {}
  }

  // Generar token criptográfico único por instalación si no existe
  const generated = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(tokenFile, generated, { mode: 0o600 });
  } catch {}
  return generated;
}

const dataDir = resolveDataDir();

export const CONFIG = {
  port: parseInt(process.env.OPENCODE_PORT || '4096', 10),
  hostname: process.env.OPENCODE_HOST || '127.0.0.1',
  defaultModel: process.env.OPENCODE_DEFAULT_MODEL || 'opencode/nemotron-3.5-super-vl-free',
  multimodalModel: process.env.OPENCODE_MULTIMODAL_MODEL || 'opencode/nemotron-3.5-super-vl-free',
  serverUsername: process.env.OPENCODE_SERVER_USERNAME || 'opencode',
  serverPassword: resolveServerPassword(dataDir),
  requestTimeoutMs: parseInt(process.env.OPENCODE_TIMEOUT_MS || '600000', 10),
  dashboardPort: parseInt(process.env.OPENBRIDGE_DASHBOARD_PORT || '4098', 10),
  cliPath: resolveCliPath(),
  dataDir,
  jobsFile: path.join(dataDir, 'jobs.jsonl'),
  maxDepth: parseInt(process.env.OPENBRIDGE_MAX_DEPTH || '2', 10)
};

export function getBaseUrl() {
  return `http://${CONFIG.hostname}:${CONFIG.port}`;
}

export function getAuthHeader(customPassword = null) {
  const pwd = customPassword || CONFIG.serverPassword;
  const token = Buffer.from(`${CONFIG.serverUsername}:${pwd}`).toString('base64');
  return `Basic ${token}`;
}
