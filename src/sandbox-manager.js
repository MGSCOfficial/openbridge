import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_SANDBOX_DIR = path.join(os.tmpdir(), 'openbridge_sandboxes');

export function createSandbox(sessionID) {
  const dir = path.isAbsolute(sessionID) ? sessionID : path.join(BASE_SANDBOX_DIR, sessionID);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanupSandbox(target) {
  const dir = path.isAbsolute(target) ? target : path.join(BASE_SANDBOX_DIR, target);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Non-fatal if locked momentarily
  }
}
