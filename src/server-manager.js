import { spawn } from 'node:child_process';
import { CONFIG, getBaseUrl, getAuthHeader } from './config.js';

let spawnedProcess = null;
let activeAuthPassword = CONFIG.serverPassword;

export async function isServerAlive(password = null) {
  const url = `${getBaseUrl()}/api/info`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(password || activeAuthPassword)
      },
      signal: AbortSignal.timeout(3000)
    });
    return res.status === 200 || res.status === 401;
  } catch {
    return false;
  }
}

export async function checkServerAuth(password = null) {
  const url = `${getBaseUrl()}/api/info`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(password || activeAuthPassword)
      },
      signal: AbortSignal.timeout(3000)
    });
    if (res.status === 200) {
      return { ok: true, data: await res.json() };
    }
    return { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function ensureServerRunning() {
  // 1. Check if server is already running with our active password
  const initialCheck = await checkServerAuth(activeAuthPassword);
  if (initialCheck.ok) {
    return { running: true, spawned: false, url: getBaseUrl(), password: activeAuthPassword };
  }

  // 1b. Backward-compatibility: Check if server is running with legacy token
  const legacyCheck = await checkServerAuth('openbridge_local_token_2026');
  if (legacyCheck.ok) {
    activeAuthPassword = 'openbridge_local_token_2026';
    return { running: true, spawned: false, url: getBaseUrl(), password: activeAuthPassword };
  }

  // 2. If already alive on port (e.g. desktop app with auto-generated token)
  const alive = await isServerAlive();
  if (alive) {
    return { running: true, spawned: false, url: getBaseUrl(), password: activeAuthPassword, warning: 'Auth required' };
  }

  // 3. Not running: spawn server process
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: CONFIG.serverPassword,
      OPENCODE_SERVER_USERNAME: CONFIG.serverUsername
    };

    const isCmd = CONFIG.cliPath.endsWith('.cmd') || CONFIG.cliPath.endsWith('.bat');
    const args = ['serve', '--hostname', CONFIG.hostname, '--port', String(CONFIG.port)];

    const child = spawn(CONFIG.cliPath, args, {
      env,
      shell: isCmd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true
    });

    spawnedProcess = child;
    let resolved = false;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const pwdMatch = text.match(/server password ([^\r\n\s]+)/);
      if (pwdMatch && pwdMatch[1]) {
        activeAuthPassword = pwdMatch[1];
      }
      if (text.includes('server listening on') && !resolved) {
        resolved = true;
        resolve({
          running: true,
          spawned: true,
          url: getBaseUrl(),
          password: activeAuthPassword
        });
      }
    });

    child.stderr.on('data', () => {});

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to spawn OpenCode server: ${err.message}`));
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`OpenCode server exited prematurely with code ${code}`));
      }
    });

    // Timeout fallback: poll /api/info for up to 10 seconds
    const interval = setInterval(async () => {
      if (resolved) {
        clearInterval(interval);
        return;
      }
      const isUp = await isServerAlive(activeAuthPassword);
      if (isUp) {
        resolved = true;
        clearInterval(interval);
        resolve({
          running: true,
          spawned: true,
          url: getBaseUrl(),
          password: activeAuthPassword
        });
      }
    }, 1000);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(interval);
        reject(new Error('OpenCode server startup timed out after 10s'));
      }
    }, 10000);
  });
}

export function getActivePassword() {
  return activeAuthPassword;
}

export function setActivePassword(pwd) {
  activeAuthPassword = pwd;
}

export function stopSpawnedServer() {
  if (spawnedProcess && !spawnedProcess.killed) {
    spawnedProcess.kill();
    spawnedProcess = null;
  }
}
