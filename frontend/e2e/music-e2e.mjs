// E2E for the music bar: local folder, tags + cover art, transport controls, queue, colors.
//   cd frontend && node e2e/music-e2e.mjs
// Builds its own folder of short silent WAVs (one carries ID3 tags with a cover). Set E2E_MUSIC_DIR
// to also play a folder of real songs and print what was read from their tags.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FRONTEND, launch } from './harness.mjs';

const OUT = process.env.E2E_OUT || path.join(FRONTEND, 'e2e', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ── Fixture: silent 8 kHz mono WAVs; the first has an "id3 " chunk with title/artist/album/cover ──
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const u32be = (n) => Buffer.from([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const synchsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const id3Frame = (id, data) => Buffer.concat([Buffer.from(id), u32be(data.length), Buffer.from([0, 0]), data]);
const text = (s) => Buffer.concat([Buffer.from([0]), Buffer.from(s, 'latin1')]);
function id3({ title, artist, album }) {
  const body = Buffer.concat([
    id3Frame('TIT2', text(title)), id3Frame('TPE1', text(artist)), id3Frame('TALB', text(album)),
    id3Frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0'), Buffer.from([3, 0]), PNG])),
  ]);
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), synchsafe(body.length), body]);
}
function wav(seconds, tags) {
  const rate = 8000, data = Buffer.alloc(rate * 2 * seconds);
  const chunk = (id, b) => Buffer.concat([Buffer.from(id), Buffer.from(Uint32Array.of(b.length).buffer), b, b.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(rate, 4); fmt.writeUInt32LE(rate * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), chunk('data', data), tags ? chunk('id3 ', id3(tags)) : Buffer.alloc(0)]);
  return Buffer.concat([Buffer.from('RIFF'), Buffer.from(Uint32Array.of(body.length).buffer), body]);
}
const MUSIC = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-music-'));
fs.writeFileSync(path.join(MUSIC, '01 alpha.wav'), wav(4, { title: 'Alpha Song', artist: 'Test Artist', album: 'Fixture Album' }));
fs.writeFileSync(path.join(MUSIC, '02 Beta.wav'), wav(4));
fs.writeFileSync(path.join(MUSIC, '03 Gamma.wav'), wav(4));
fs.mkdirSync(path.join(MUSIC, 'more'));
fs.writeFileSync(path.join(MUSIC, 'more', '04 Delta.wav'), wav(4));
fs.writeFileSync(path.join(MUSIC, 'notes.txt'), 'not audio');

const t = await launch();
const { win, errors } = t;
const shot = (name) => win.screenshot({ path: path.join(OUT, `${name}.png`) });
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await win.waitForTimeout(100); }
  return false;
};
const bar = () => win.getByTestId('music-bar');
const title = () => win.getByTestId('music-title').textContent();
const playBtn = () => win.getByTestId('music-play');
const isPlaying = async () => (await playBtn().getAttribute('aria-label')) === 'Pause';
const useFolder = (folder) => win.evaluate(async (folder) => {
  const s = await window.electronAPI.loadSettings();
  await window.electronAPI.saveSettings({ ...s, music: { ...(s.music || {}), enabled: true, folder } });
}, folder);

try {
  await t.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await win.getByTestId('welcome').waitFor({ timeout: 60000 });
  check('music bar is off by default', await bar().count() === 0);

  // 1. Folder -> tracks (subfolders included, non-audio skipped); tags and cover from the file
  await useFolder(MUSIC);
  check('music bar appears once enabled', await until(() => bar().isVisible()));
  check('first track title comes from its tags', await until(async () => (await title()) === 'Alpha Song'), await title());
  check('artist and album come from its tags', (await win.getByTestId('music-artist').textContent()) === 'Test Artist · Fixture Album');
  check('cover art from the tags is shown', await until(() => win.getByTestId('music-cover').evaluate(img => img.complete && img.naturalWidth > 0)));
  await win.getByTestId('music-queue-toggle').click();
  const queue = await win.getByTestId('music-queue').locator('button').allTextContents();
  check('queue lists audio files only, subfolders included', queue.length === 4 && queue.join('|') === '101 alpha|202 Beta|303 Gamma|404 Delta', queue.join('|'));
  await win.getByTestId('music-queue-toggle').click();

  // 2. Transport
  await playBtn().click();
  check('play starts playback', await until(isPlaying));
  check('time advances while playing', await until(async () => (await win.getByTestId('music-time').textContent()) === '0:01', 4000));
  check('duration is read', (await win.getByTestId('music-duration').textContent()) === '0:04');
  check('media keys / Windows overlay get the track', await win.evaluate(() => navigator.mediaSession.metadata?.title) === 'Alpha Song');
  await shot('m1-playing');
  await win.getByTestId('music-next').click();
  check('next goes to the next track', await until(async () => (await title()) === '02 Beta'));
  check('untagged file falls back to its file name and a placeholder cover',
    (await win.getByTestId('music-artist').textContent()) === 'Unknown artist' && await win.getByTestId('music-cover-placeholder').isVisible());
  check('next keeps playing', await until(isPlaying));
  await win.getByTestId('music-prev').click();
  check('previous goes back a track', await until(async () => (await title()) === 'Alpha Song'));
  await win.getByTestId('music-seek').fill('3');
  check('seeking moves the playhead', await until(async () => (await win.getByTestId('music-time').textContent()) === '0:03'));
  check('a finished track advances to the next', await until(async () => (await title()) === '02 Beta', 6000));
  await playBtn().click();
  check('pause stops playback', await until(async () => !(await isPlaying())));
  const pausedAt = await win.getByTestId('music-time').textContent();
  await win.waitForTimeout(1300);
  check('time holds while paused', (await win.getByTestId('music-time').textContent()) === pausedAt);
  await win.getByTestId('music-queue-toggle').click();
  await win.getByTestId('music-queue').getByText('04 Delta').click();
  check('picking from the queue plays that track', await until(async () => (await title()) === '04 Delta' && await isPlaying()));

  // 3. Settings: folder shown, palette customization, reset to theme colors, hide
  await win.getByLabel('Settings (Ctrl+,)').click();
  await win.getByTestId('settings-page').waitFor();
  check('Settings shows the music folder', (await win.getByTestId('music-folder').textContent()) === MUSIC);
  const accent = () => playBtn().evaluate(el => getComputedStyle(el).backgroundColor);
  check('default accent matches the TermiCursor green', (await accent()) === 'rgb(57, 255, 20)', await accent());
  await win.getByLabel('Violet accent').click();
  check('a palette preset recolors the bar', await until(async () => (await accent()) === 'rgb(184, 119, 255)'), await accent());
  await win.getByTestId('music-bg').fill('#1a1030');
  check('custom bar background applies', await until(async () => (await bar().evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(26, 16, 48)'));
  await shot('m2-custom-colors');
  await win.getByTitle('Reset colors to the TermiCursor theme').click();
  check('reset restores the theme colors', await until(async () => (await accent()) === 'rgb(57, 255, 20)'));
  await win.getByTestId('setting-music').click();
  check('hiding the bar removes it', await until(async () => (await bar().count()) === 0));
  await win.getByTestId('setting-music').click();
  await bar().waitFor();
  check('hiding the bar stopped the music', await until(async () => !(await isPlaying())));
  await shot('m2b-theme-default');

  // 4. Optional: real songs
  if (process.env.E2E_MUSIC_DIR) {
    await useFolder(process.env.E2E_MUSIC_DIR);
    await until(() => bar().isVisible());
    await win.getByTestId('music-queue-toggle').click();
    const songs = await win.getByTestId('music-queue').locator('button').count();
    await win.getByTestId('music-queue-toggle').click();
    check('real songs folder is listed', songs > 0, `${songs} tracks`);
    for (let i = 0; i < songs; i++) {
      if (i) await win.getByTestId('music-next').click();
      else await playBtn().click();
      await until(isPlaying);
      await win.waitForTimeout(1500);
      const hasCover = await win.getByTestId('music-cover').count() > 0;
      const info = `${await title()} — ${await win.getByTestId('music-artist').textContent()} — cover: ${hasCover ? 'yes' : 'no'} — ${await win.getByTestId('music-duration').textContent()}`;
      check(`real song ${i + 1} plays`, await isPlaying() && (await win.getByTestId('music-time').textContent()) !== '0:00', info);
      await shot(`m3-real-${i + 1}`);
    }
    await playBtn().click();
  }

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('run completed', false, e.message.split('\n')[0]);
  await shot('m99-failure').catch(() => {});
} finally {
  await t.close();
  fs.rmSync(MUSIC, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
