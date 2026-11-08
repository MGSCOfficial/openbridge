import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

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

export const CONFIG = {
  port: parseInt(process.env.OPENCODE_PORT || '4096', 10),
  hostname: process.env.OPENCODE_HOST || '127.0.0.1',
  defaultModel: process.env.OPENCODE_DEFAULT_MODEL || 'opencode/nemotron-3.5-super-vl-free',
  multimodalModel: process.env.OPENCODE_MULTIMODAL_MODEL || 'opencode/nemotron-3.5-super-vl-free',
  serverUsername: process.env.OPENCODE_SERVER_USERNAME || 'opencode',
  serverPassword: process.env.OPENCODE_SERVER_PASSWORD || 'openbridge_local_token_2026',
  requestTimeoutMs: parseInt(process.env.OPENCODE_TIMEOUT_MS || '600000', 10),
  cliPath: resolveCliPath()
};

export function getBaseUrl() {
  return `http://${CONFIG.hostname}:${CONFIG.port}`;
}

export function getAuthHeader(customPassword = null) {
  const pwd = customPassword || CONFIG.serverPassword;
  const token = Buffer.from(`${CONFIG.serverUsername}:${pwd}`).toString('base64');
  return `Basic ${token}`;
}
