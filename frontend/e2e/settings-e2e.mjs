// E2E for the Settings page: API provider CRUD, show-key, legacy Groq migration, custom shortcuts.
//   cd frontend && node e2e/settings-e2e.mjs
// No Ollama model calls needed; runs its own backend and Vite like run-e2e.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { FRONTEND, launch } from './harness.mjs';

const OUT = process.env.E2E_OUT || path.join(FRONTEND, 'e2e', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const t = await launch();
const { app, win, errors } = t;
const shot = (name) => win.screenshot({ path: path.join(OUT, `${name}.png`) });
const userData = await app.evaluate(({ app }) => app.getPath('userData'));
const saved = () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf-8'));
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await win.waitForTimeout(100); }
  return false;
};
const openSettings = async () => {
  await win.getByLabel('Settings (Ctrl+,)').click();
  await win.getByTestId('settings-page').waitFor();
};
const rows = () => win.getByTestId('provider-row');
const providerSelect = () => win.locator('select').first();

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await win.getByTestId('welcome').waitFor({ timeout: 60000 });

  // 1. Old installs stored Groq in dedicated fields; they become a normal provider.
  await win.evaluate(() => window.electronAPI.saveSettings({ llmProvider: 'groq', groqApiKey: 'gsk_secret_ABCD1234', groqModel: 'llama-3.3-70b-versatile' }));
  await openSettings();
  await rows().first().waitFor();
  const migrated = saved();
  check('legacy Groq settings migrate to a provider entry',
    !('groqApiKey' in migrated) && migrated.customProviders?.[0]?.name === 'Groq'
    && migrated.customProviders[0].model === 'llama-3.3-70b-versatile' && migrated.llmProvider === 'Groq',
    JSON.stringify({ ...migrated, customProviders: migrated.customProviders?.map(p => ({ ...p, apiKey: '…' })) }));
  const options = await providerSelect().locator('option').allTextContents();
  check('provider dropdown has no hard-coded groq', JSON.stringify(options) === '["ollama","Groq"]', options.join(','));

  // 2. Show / hide API key
  const keyText = () => rows().first().getByTestId('provider-key').textContent();
  check('API key is masked by default', (await keyText()) === '••••••••1234', await keyText());
  await rows().first().getByLabel('Show API key').click();
  check('show API key reveals it', (await keyText()) === 'gsk_secret_ABCD1234');
  await shot('s1-provider-key-shown');
  await rows().first().getByLabel('Hide API key').click();
  check('hide API key masks it again', (await keyText()) === '••••••••1234');

  // 3. Edit (rename the active provider + change model); form key field has its own eye toggle
  await rows().first().getByLabel('Edit Groq').click();
  const form = win.getByTestId('providers-editor');
  const keyInput = form.getByPlaceholder('API key');
  check('edit loads the key hidden', (await keyInput.getAttribute('type')) === 'password' && (await keyInput.inputValue()) === 'gsk_secret_ABCD1234');
  await keyInput.locator('..').getByLabel('Show API key').click();
  check('form show-key toggles the input', (await keyInput.getAttribute('type')) === 'text');
  await form.getByPlaceholder('Name (e.g. DeepSeek)').fill('Groq Fast');
  await form.getByPlaceholder('Model (e.g. deepseek-chat)').fill('llama-3.1-8b-instant');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await until(() => saved().customProviders?.[0]?.name === 'Groq Fast');
  const afterEdit = saved();
  check('edit updates the provider in place', afterEdit.customProviders.length === 1
    && afterEdit.customProviders[0].model === 'llama-3.1-8b-instant' && afterEdit.customProviders[0].apiKey === 'gsk_secret_ABCD1234');
  check('renaming the active provider keeps it selected', afterEdit.llmProvider === 'Groq Fast'
    && (await providerSelect().inputValue()) === 'Groq Fast', afterEdit.llmProvider);

  // 4. Create via preset, and validation
  await form.getByRole('button', { name: 'Gemini', exact: true }).click();
  await form.getByRole('button', { name: 'Add provider' }).click();
  check('missing key is rejected', await win.getByText('Name, model and API key are required.').isVisible());
  await form.getByPlaceholder('API key').fill('gem-key-9999');
  await form.getByRole('button', { name: 'Add provider' }).click();
  await until(() => saved().customProviders?.length === 2);
  check('add provider from a preset', saved().customProviders[1].name === 'Gemini' && await rows().count() === 2);
  await form.getByPlaceholder('Name (e.g. DeepSeek)').fill('gemini');
  await form.getByPlaceholder('Model (e.g. deepseek-chat)').fill('x');
  await form.getByPlaceholder('API key').fill('y');
  await form.getByRole('button', { name: 'Add provider' }).click();
  check('duplicate names are rejected', await win.getByText('A provider named "gemini" already exists.').isVisible());
  await shot('s2-providers');

  // 5. Delete the active provider -> falls back to Ollama
  await rows().first().getByLabel('Remove Groq Fast').click();
  await until(() => saved().customProviders?.length === 1);
  const afterDelete = saved();
  check('delete removes the provider', afterDelete.customProviders.map(p => p.name).join() === 'Gemini' && await rows().count() === 1);
  check('deleting the active provider falls back to ollama', afterDelete.llmProvider === 'ollama', afterDelete.llmProvider);

  // 6. Custom keyboard shortcuts
  const btn = (id) => win.getByTestId(`shortcut-${id}`);
  await btn('openSettings').click();
  await win.keyboard.press('Control+Alt+S');
  await until(() => saved().keybindings?.openSettings === 'Ctrl+Alt+S');
  check('record a new shortcut', saved().keybindings?.openSettings === 'Ctrl+Alt+S' && (await btn('openSettings').textContent()) === 'Ctrl+Alt+S');
  await btn('toggleExplorer').click();
  await win.keyboard.press('Control+Alt+S');
  check('conflicting shortcut is rejected', (await win.getByTestId('shortcut-error').textContent()).includes('already used by "Settings"'));
  await win.keyboard.press('Escape');
  await btn('toggleExplorer').click();
  await win.keyboard.press('G');
  check('shortcut without Ctrl/Alt is rejected', (await win.getByTestId('shortcut-error').textContent()).includes('Use Ctrl or Alt'));
  await win.keyboard.press('Escape');
  check('Esc cancels recording', (await btn('toggleExplorer').textContent()) === 'Ctrl+B' && !saved().keybindings?.toggleExplorer);
  await shot('s3-shortcuts');

  await win.getByLabel('Profile').click();
  await win.getByTestId('profile-page').waitFor();
  await win.locator('body').click({ position: { x: 5, y: 450 } });
  await win.keyboard.press('Control+,');
  await win.waitForTimeout(400);
  check('old binding no longer fires', await win.getByTestId('settings-page').count() === 0);
  await win.keyboard.press('Control+Alt+S');
  check('new binding opens Settings', await until(() => win.getByTestId('settings-page').isVisible()));

  await win.getByLabel('Reset Settings').click();
  await until(() => !saved().keybindings?.openSettings);
  check('reset restores the default', (await btn('openSettings').textContent()) === 'Ctrl+,');

  // Rebound command palette, through its own listener
  await btn('commandPalette').click();
  await win.keyboard.press('Control+Shift+K');
  await until(() => saved().keybindings?.commandPalette === 'Ctrl+Shift+K');
  await win.locator('body').click({ position: { x: 5, y: 450 } });
  await win.keyboard.press('Control+Shift+K');
  check('rebound command palette opens', await until(() => win.getByTestId('command-palette').isVisible()));
  check('palette shows the new binding', (await win.getByTestId('command-palette').textContent()).includes('Ctrl+,'));
  await win.keyboard.press('Escape');
  await win.keyboard.press('Control+/');
  check('shortcut overview lists the custom binding', await until(() => win.getByText('Ctrl+Shift+K').first().isVisible()));
  await shot('s4-overview');

  // 7. Model picker in the agent composer
  await win.keyboard.press('Escape');
  const picker = win.getByTestId('model-picker');
  await picker.waitFor();
  const opts = await picker.locator('option').allTextContents();
  check('picker lists Ollama models and API providers', opts.includes('Gemini · gemini-2.5-flash') && opts.some(o => o.includes('qwen2.5-coder')) && !opts.some(o => o.includes('embed')), opts.join(', '));
  await picker.selectOption('provider::Gemini');
  await until(() => saved().llmProvider === 'Gemini');
  check('picking an API provider saves it', saved().llmProvider === 'Gemini');
  check('backend switches to the picked model', await until(() => win.getByTestId('status-bar').textContent().then(t => t.includes('gemini-2.5-flash')), 10000),
    (await win.getByTestId('status-bar').textContent()).trim());
  check('Settings page follows the picker', (await providerSelect().inputValue()) === 'Gemini');
  await picker.selectOption('ollama::qwen2.5-coder:3b');
  await until(() => saved().llmProvider === 'ollama');
  check('picking an Ollama model saves provider + model', saved().llmProvider === 'ollama' && saved().ollamaModel === 'qwen2.5-coder:3b');
  check('Settings page follows the picker back', (await providerSelect().inputValue()) === 'ollama');
  // A later Settings edit must not revert the picker's choice
  await win.getByRole('switch').first().click();
  await win.waitForTimeout(400);
  check('later Settings edits keep the picked model', saved().llmProvider === 'ollama' && saved().ollamaModel === 'qwen2.5-coder:3b');
  await win.getByRole('switch').first().click();
  await shot('s5-model-picker');

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
  await shot('s99-failure').catch(() => {});
} finally {
  await t.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
