// Starts an isolated TermiCursor (own backend port, temp data, temp Electron profile),
// launches the real Electron app with Playwright, and cleans everything up.
import { _electron as electron } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(FRONTEND, '..');

// Same fixture as tests/live_agent_eval.py: answers can't be guessed without reading the code.
export const FIXTURE = {
  'calc.py': '"""Tiny calculator."""\n\n\ndef add(a, b):\n    return a + b\n\n\ndef multiply(a, b):\n    return a + b\n',
  'settings.py': 'APP_NAME = "evalapp"\nRETRY_LIMIT = 5\nDEFAULT_TIMEOUT = 37\n',
  'app/__init__.py': '',
  'app/routes.py': "ROUTES = {}\n\n\ndef fetch_user_roster():\n    return ['ada', 'linus']\n",
  'test_calc.py': 'import unittest\n\nfrom calc import add, multiply\n\n\nclass CalcTest(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n    def test_multiply(self):\n        self.assertEqual(multiply(2, 3), 6)\n\n\nif __name__ == "__main__":\n    unittest.main()\n',
  'README.md': '# demo-app\n\nA tiny project used to test TermiCursor.\n',
};

export function makeProject(files = FIXTURE) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tc-e2e-')), 'demo-app');
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return root;
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const tryConnect = (port, host) => new Promise((resolve) => {
  const sock = net.connect(port, host);
  sock.on('connect', () => { sock.destroy(); resolve(true); });
  sock.on('error', () => resolve(false));
});
// Vite binds "localhost", which Node may resolve to IPv6 only.
const portOpen = async (port) => (await tryConnect(port, '127.0.0.1')) || (await tryConnect(port, '::1'));

async function waitForPort(port, what, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${what} did not start on port ${port}`);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    child.kill();
  }
}

export async function launch({ log = () => {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-e2e-data-'));
  const backendPort = await freePort();
  const vitePort = await freePort();  // own Vite, so a running `npm run dev` isn't disturbed
  const python = process.env.E2E_PYTHON || 'python';
  const children = [];

  const backend = spawn(python, ['-m', 'uvicorn', 'server:app', '--port', String(backendPort)], {
    cwd: REPO, windowsHide: true,
    env: { ...process.env, TERMICURSOR_USER_DATA: path.join(tmp, 'backend'), TERMICURSOR_EXTRA_ORIGIN: `http://localhost:${vitePort}` },
  });
  children.push(backend);
  backend.stderr.on('data', (d) => log(`[backend] ${d}`));
  const vite = spawn(process.execPath, [path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(vitePort), '--strictPort'], {
    cwd: FRONTEND, env: process.env, windowsHide: true,
  });
  children.push(vite);
  let viteOut = '';
  vite.stdout.on('data', (d) => { viteOut += d; });
  vite.stderr.on('data', (d) => { viteOut += d; });
  vite.on('exit', (code) => log(`[vite] exited ${code}: ${viteOut}`));
  await Promise.all([waitForPort(backendPort, 'backend'), waitForPort(vitePort, 'vite')]);

  const app = await electron.launch({
    executablePath: require('electron'),
    args: [FRONTEND],
    cwd: FRONTEND,
    env: {
      ...process.env, TERMICURSOR_BACKEND_PORT: String(backendPort), TERMICURSOR_E2E_USER_DATA: path.join(tmp, 'electron'),
      TERMICURSOR_DEV_URL: `http://localhost:${vitePort}`,
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  const errors = [];
  win.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${(e.stack || '').split('\n').slice(1, 4).map((l) => l.trim()).join(' < ')}`));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  // Answer the native "Open Folder" dialog with a given path.
  const stubFolderDialog = (dir) => app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
  }, dir);

  const close = async () => {
    try { await app.close(); } catch { /* ignore */ }
    children.forEach(killTree);
  };
  return { app, win, errors, backendPort, stubFolderDialog, close };
}
