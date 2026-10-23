// E2E for the Settings page: API provider CRUD, show-key, legacy Groq migration, custom shortcuts.
//   cd frontend && node e2e/settings-e2e.mjs
// No Ollama model calls needed; runs its own backend and Vite like run-e2e.mjs.
import fs from 'node:fs';
import path from 'node:path';
import gifenc from 'gifenc';
const { GIFEncoder } = gifenc;
import { FRONTEND, REPO, launch } from './harness.mjs';

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
  // The shortcut overview (Ctrl+/) has no Esc handler; close it via its backdrop so it can't block clicks.
  const overview = win.locator('div.backdrop-blur-sm');
  if (await overview.count()) await overview.click({ position: { x: 5, y: 5 } });
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

  // 8. Built-in terminal character: ships in public/mascot, shown with no upload, one GIF per state
  const status = (s) => win.evaluate((s) => window.dispatchEvent(new CustomEvent('agent-status', { detail: s })), s);
  const mascotSrc = () => win.getByTestId('mascot').locator('img').getAttribute('src');
  for (const s of ['walk', 'idle', 'done', 'error']) await win.getByTestId(`mascot-default-${s}`).waitFor();
  check('Settings shows the built-in GIF in every slot', true);
  await win.getByTestId('setting-mascot').click();
  check('companion appears with the built-in character', await until(() => win.getByTestId('mascot').isVisible()));
  const builtIn = await win.evaluate(async () => Promise.all(['walk', 'idle', 'done', 'error'].map(async (s) => {
    const r = await fetch(`./mascot/${s}.gif`);
    const b = new Uint8Array(await r.arrayBuffer());
    const d = new ImageDecoder({ data: b, type: 'image/gif' });
    await d.tracks.ready;
    const { image } = await d.decode({ frameIndex: 0 });
    return `${s}:${r.status}:${String.fromCharCode(...b.slice(0, 6))}:${image.displayWidth}:${d.tracks.selectedTrack.frameCount > 1}`;
  })));
  check('all four built-in GIFs load and animate', builtIn.every(x => /:200:GIF89a:160:true$/.test(x)), builtIn.join(' '));
  check('idle uses the built-in idle GIF', (await mascotSrc()).endsWith('mascot/idle.gif'));
  await status('running');
  check('running uses the built-in walk GIF', await until(async () => (await mascotSrc()).endsWith('mascot/walk.gif')));
  await status('done');
  check('done uses the built-in done GIF', await until(async () => (await mascotSrc()).endsWith('mascot/done.gif')));
  await shot('s6a-builtin-done');
  await status('running');
  await status('error');
  check('error uses the built-in error GIF', await until(async () => (await mascotSrc()).endsWith('mascot/error.gif')));
  await shot('s6b-builtin-error');
  await until(async () => (await win.getByTestId('mascot-bubble').count()) === 0, 6000);   // reaction ends, back to idle

  // Companion uploads: GIF-only, a custom Walk replaces the built-in set, reacts to run status
  const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const walkInput = win.getByTestId('mascot-file-walk');
  await walkInput.setInputFiles({ name: 'renamed.gif', mimeType: 'image/gif', buffer: Buffer.from(PNG, 'base64') });
  check('a PNG renamed to .gif is rejected', await until(() => win.getByTestId('mascot-error-walk').isVisible()));
  await walkInput.setInputFiles({ name: 'hero.gif', mimeType: 'image/gif', buffer: Buffer.from(GIF, 'base64') });
  await until(() => saved().mascot?.files?.walk?.name === 'hero.gif');
  check('a GIF upload is stored on disk', fs.existsSync(path.join(userData, 'mascot', 'walk.gif')));
  const ipcReject = await win.evaluate((b) => window.electronAPI.saveMascot('idle', Uint8Array.from(atob(b), c => c.charCodeAt(0))), PNG);
  check('main process rejects non-GIF bytes', ipcReject.success === false, JSON.stringify(ipcReject));
  check('a custom Walk replaces the built-in character', await until(async () => (await mascotSrc()).startsWith('data:image/gif')));
  await status('done');   // straight from idle, like opening a past chat: no reaction
  await win.waitForTimeout(300);
  check('no celebration without a run', await win.getByTestId('mascot-bubble').count() === 0);
  await status('running');
  await status('done');
  check('celebrates when a run finishes', await until(() => win.getByTestId('mascot-bubble').textContent().then(t => t === 'Done!')));
  await shot('s6-mascot');

  // 9. Remove background: white canvas -> transparent, cropped, enclosed white "eye" kept
  const W = 20, enc = GIFEncoder(), idx = new Uint8Array(W * W);   // 0 = white, 1 = black
  for (let y = 7; y <= 12; y++) for (let x = 7; x <= 12; x++) {
    const corner = (x === 7 || x === 12) && (y === 7 || y === 12);
    idx[y * W + x] = corner || (x === 9 && y === 9) ? 0 : 1;
  }
  for (let f = 0; f < 2; f++) enc.writeFrame(idx, W, W, { palette: [[255, 255, 255], [0, 0, 0]], delay: 100 });
  enc.finish();
  const inspect = () => win.evaluate(async () => {
    const url = await window.electronAPI.loadMascot('walk');
    const d = new ImageDecoder({ data: await (await fetch(url)).arrayBuffer(), type: 'image/gif' });
    await d.tracks.ready;
    const { image } = await d.decode({ frameIndex: 0 });
    const c = new OffscreenCanvas(image.displayWidth, image.displayHeight).getContext('2d');
    c.drawImage(image, 0, 0);
    const px = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data);
    return { w: image.displayWidth, h: image.displayHeight, frames: d.tracks.selectedTrack.frameCount, corner: px(0, 0), edge: px(1, 0), eye: px(2, 2) };
  });
  const clearBg = async () => {
    const v = saved().mascot.files.walk.v;
    await win.getByTestId('mascot-clear-bg-walk').click();
    return until(() => saved().mascot.files.walk.v !== v, 60000);
  };
  await walkInput.setInputFiles({ name: 'square.gif', mimeType: 'image/gif', buffer: Buffer.from(enc.bytes()) });
  await until(() => saved().mascot?.files?.walk?.name === 'square.gif');
  await win.waitForTimeout(300);   // preview loads
  check('remove background saves a new GIF', await clearBg());
  const sq = await inspect();
  check('background is transparent and cropped to the character', sq.w === 6 && sq.h === 6 && sq.frames === 2 && sq.corner[3] === 0 && sq.edge.join() === '0,0,0,255', JSON.stringify(sq));
  check('enclosed white pixels (eyes) are kept', sq.eye.join() === '255,255,255,255', JSON.stringify(sq.eye));

  await walkInput.setInputFiles(path.join(REPO, 'gif.gif'));
  await until(() => saved().mascot?.files?.walk?.name === 'gif.gif');
  await win.waitForTimeout(500);
  check('remove background on the sample GIF', await clearBg());
  const real = await inspect();
  check('sample GIF is cut out and cropped', real.w < 1600 && real.h < 1200 && real.frames === 12 && real.corner[3] === 0, JSON.stringify(real));
  await win.getByTestId('mascot-clear-bg-walk').click();
  check('an already transparent GIF is reported', await until(() => win.getByTestId('mascot-error-walk').textContent().then(t => t.includes('already has a transparent'))));
  await shot('s7-mascot-cutout');

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
