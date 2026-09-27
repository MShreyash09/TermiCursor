// End-to-end test of the real Electron app against a real backend + Ollama.
//   cd frontend && node e2e/run-e2e.mjs
// Needs: Ollama running with the default models and the Python deps installed. Runs its own
// backend and Vite on free ports. Screenshots go to e2e/screenshots (or $E2E_OUT).
import fs from 'node:fs';
import path from 'node:path';
import { FRONTEND, launch, makeProject } from './harness.mjs';

const OUT = process.env.E2E_OUT || path.join(FRONTEND, 'e2e', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const t = await launch();
const { app, win, errors, stubFolderDialog } = t;
const shot = (name) => win.screenshot({ path: path.join(OUT, `${name}.png`) });
const agentDone = async (ms) => {
  const status = win.getByTestId('agent-status');
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await win.getByTestId('approval-approve').isVisible().catch(() => false)) {
      await shot('07-approval');
      await win.getByTestId('approval-approve').click();
    }
    const text = await status.textContent();
    if (/Done|Error|Stopped/.test(text) || await win.getByTestId('plan-review').isVisible().catch(() => false)) return text;
    await win.waitForTimeout(500);
  }
  return 'timeout';
};

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));

  // 1. Welcome, backend + Ollama detected
  await win.getByTestId('welcome').waitFor({ timeout: 60000 });
  await win.getByTestId('status-bar').getByText('ready').waitFor({ timeout: 60000 });
  check('backend and model ready', true, (await win.getByTestId('status-bar').textContent()).trim());
  await shot('01-welcome');

  // 2. Open a project
  const project = makeProject();
  await stubFolderDialog(project);
  await win.getByTestId('open-folder').click();
  await win.getByTestId('file-tree').getByText('calc.py', { exact: true }).waitFor({ timeout: 30000 });
  await win.getByTestId('project-home').waitFor();
  await win.waitForFunction(() => !document.querySelector('[data-testid="status-bar"]')?.textContent?.includes('indexing'), null, { timeout: 120000 });
  check('project opens with file tree and project home', true);
  await shot('02-project');

  // 3. Open a file in the editor
  await win.getByTestId('file-tree').getByText('calc.py', { exact: true }).click();
  await win.locator('.monaco-editor').waitFor({ timeout: 20000 });
  await win.waitForTimeout(1200);
  const editorText = (await win.locator('.view-lines').textContent()).replace(/\u00a0/g, ' ');
  check('file opens in the editor', editorText.includes('def multiply'));

  // 4. Terminal
  await win.getByTestId('terminal').locator('.xterm').click();
  await win.keyboard.type('python --version');
  await win.keyboard.press('Enter');
  await win.waitForTimeout(3000);
  const termText = await win.getByTestId('terminal').locator('.xterm-rows').textContent();
  check('terminal runs a command', /Python \d/.test(termText), termText.match(/Python [\d.]+/)?.[0] ?? termText.slice(-80));
  await shot('03-editor-terminal');

  // 5. Ask mode: answer only findable by reading the code (multiply has a planted bug)
  await win.getByTestId('mode-ask').click();
  await win.getByTestId('agent-input').fill('What does multiply(2, 3) return in this project?');
  await win.keyboard.press('Enter');
  const askStatus = await agentDone(240000);
  const transcript = await win.getByTestId('agent-transcript').textContent();
  // GUI check: the run completes and looks at the code. Answer accuracy is the model's job
  // (measured by tests/live_agent_eval.py), so it's reported, not asserted.
  const looked = (transcript.match(/read_file|grep|find_files|list_dir|search_codebase/g) ?? []);
  check('ask mode completes and reads the code', askStatus.includes('Done') && looked.length > 0,
    `tools: ${looked.join(',')}; answer ${/\b5\b/.test(transcript) ? 'correct (5)' : 'wrong'}`);
  await shot('04-ask');

  // 6. Plan mode: review, approve, then it codes (approving any command it wants to run)
  await win.getByTitle('New conversation').click();
  await win.getByTestId('mode-plan').click();
  await win.getByTestId('agent-input').fill('Add a function subtract(a, b) to calc.py that returns a - b');
  await win.keyboard.press('Enter');
  await win.getByTestId('plan-review').waitFor({ timeout: 240000 });
  check('plan mode stops for review', true, `${await win.getByTestId('plan-review').locator('textarea').count() - 1} steps`);
  await shot('05-plan-review');
  await win.getByTestId('plan-approve').click();
  await win.waitForTimeout(500);
  const planStatus = await agentDone(420000);
  const calc = fs.readFileSync(path.join(project, 'calc.py'), 'utf-8');
  check('approved plan is carried out', (calc.match(/def subtract\(a, b\)/g) ?? []).length === 1
    && /def add/.test(calc) && /def multiply/.test(calc), `${planStatus.trim()}; ${calc.split('\n').length} lines`);
  await win.waitForTimeout(1000);
  const editorAfter = (await win.locator('.view-lines').textContent()).replace(/\u00a0/g, ' ');
  check('editor shows the agent\'s change', editorAfter.includes('def subtract'));
  await shot('06-plan-done');

  // 7. Settings, profile, command palette
  await win.getByLabel('Settings (Ctrl+,)').click();
  await win.getByTestId('settings-page').waitFor();
  await shot('08-settings');
  await win.getByLabel('Profile').click();
  await win.getByTestId('profile-page').waitFor();
  await win.waitForTimeout(800);
  await shot('09-profile');
  await win.getByLabel('Explorer (Ctrl+B)').click();
  await win.keyboard.press('Control+p');
  await win.getByTestId('command-palette').waitFor();
  await shot('10-palette');
  await win.keyboard.press('Escape');

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
  await shot('99-failure').catch(() => {});
} finally {
  await t.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
