import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseBuffer } from 'music-metadata';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, ListMusic, Volume2, VolumeX, FolderOpen, Music } from 'lucide-react';

// Local-file music player docked above the status bar (Settings → Music).
// Files are read through the main process (music:read) and played from blob URLs; title, artist
// and cover art come from the file's own tags. Media keys work through the Media Session API.

export interface MusicSettings { enabled: boolean; folder: string; accent: string; background: string }
export const DEFAULT_MUSIC: MusicSettings = { enabled: false, folder: '', accent: '#39ff14', background: '#0a0a0a' };
export const MUSIC_PRESETS = [
  { name: 'TermiCursor', accent: '#39ff14' }, { name: 'Violet', accent: '#b877ff' }, { name: 'Ocean', accent: '#3d8bff' },
  { name: 'Amber', accent: '#ffb000' }, { name: 'Rose', accent: '#ff5fa2' }, { name: 'Mono', accent: '#e6e6e6' },
];

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm',
};
const ext = (p: string) => p.split('.').pop()!.toLowerCase();
const baseName = (p: string) => p.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '');
const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
type RepeatMode = 'off' | 'all' | 'one';
interface Meta { title: string; artist: string; cover: string | null }

// Small per-viewer preferences (volume, shuffle, repeat, last track) live in localStorage.
const pref = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(`music.${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const savePref = (key: string, v: unknown) => { try { localStorage.setItem(`music.${key}`, JSON.stringify(v)); } catch { /* ignore */ } };

export default function MusicBar() {
  const api = (window as any).electronAPI;
  const [cfg, setCfg] = useState<MusicSettings>(DEFAULT_MUSIC);
  const [tracks, setTracks] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => pref('volume', 0.8));
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(() => pref('shuffle', false));
  const [repeat, setRepeat] = useState<RepeatMode>(() => pref('repeat', 'all'));
  const [listOpen, setListOpen] = useState(false);
  const audio = useRef<HTMLAudioElement>(new Audio());
  const urls = useRef<string[]>([]);
  const want = useRef(false);   // should the freshly loaded track start playing?

  useEffect(() => {
    const apply = (s: any) => setCfg({ ...DEFAULT_MUSIC, ...s?.music });
    api?.loadSettings?.().then(apply);
    return api?.onSettingsChanged?.(apply);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Folder -> sorted list of audio files (recursive, via the same lister the @-mentions use).
  useEffect(() => {
    if (!cfg.enabled || !cfg.folder) { setTracks([]); setIndex(-1); return; }
    api?.listFiles?.(cfg.folder).then((rel: string[]) => {
      const list = (rel || []).filter(r => ext(r) in MIME).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map(r => `${cfg.folder}/${r}`);
      setTracks(list);
      const last = list.indexOf(pref('last', ''));
      setIndex(list.length ? Math.max(last, 0) : -1);
    });
  }, [cfg.enabled, cfg.folder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!cfg.enabled) audio.current.pause(); }, [cfg.enabled]);
  useEffect(() => { audio.current.volume = volume; audio.current.muted = muted; savePref('volume', volume); }, [volume, muted]);
  useEffect(() => savePref('shuffle', shuffle), [shuffle]);
  useEffect(() => savePref('repeat', repeat), [repeat]);

  // Load the current track: bytes -> blob URL for <audio>, tags -> title/artist/cover.
  useEffect(() => {
    const path = tracks[index];
    if (!path) { setMeta(null); return; }
    let cancelled = false;
    (async () => {
      const bytes: Uint8Array | null = await api?.readMusic?.(path);
      if (cancelled) return;
      urls.current.forEach(u => URL.revokeObjectURL(u));
      urls.current = [];
      const fallback: Meta = { title: baseName(path), artist: 'Unknown artist', cover: null };
      if (!bytes) { setMeta(fallback); return; }
      const src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[ext(path)] }));
      urls.current.push(src);
      audio.current.src = src;
      savePref('last', path);
      if (want.current) audio.current.play().catch(() => {});
      let m = fallback;
      try {
        const { common } = await parseBuffer(bytes, { mimeType: MIME[ext(path)] }, { duration: false, skipPostHeaders: true });
        const pic = common.picture?.[0];
        const cover = pic ? URL.createObjectURL(new Blob([pic.data as BlobPart], { type: pic.format })) : null;
        if (cover) urls.current.push(cover);
        m = { title: common.title || fallback.title, artist: [common.artist, common.album].filter(Boolean).join(' · ') || fallback.artist, cover };
      } catch { /* untagged or unreadable tags: keep the file name */ }
      if (cancelled) return;
      setMeta(m);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: m.title, artist: m.artist, artwork: m.cover ? [{ src: m.cover }] : [] });
      }
    })();
    return () => { cancelled = true; };
  }, [tracks, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((dir: 1 | -1, auto = false) => {
    if (!tracks.length) return;
    if (dir === -1 && audio.current.currentTime > 3) { audio.current.currentTime = 0; return; }
    want.current = auto ? true : !audio.current.paused || want.current;
    let next = (index + dir + tracks.length) % tracks.length;
    if (shuffle && tracks.length > 1) while (next === index) next = Math.floor(Math.random() * tracks.length);
    if (next === index) {   // a one-track folder: just start it over
      audio.current.currentTime = 0;
      if (want.current) audio.current.play().catch(() => {});
      return;
    }
    setIndex(next);
  }, [tracks, index, shuffle]);

  const toggle = useCallback(() => {
    if (index < 0) return;
    if (audio.current.paused) { want.current = true; audio.current.play().catch(() => {}); }
    else { want.current = false; audio.current.pause(); }
  }, [index]);

  // <audio> events -> UI state; end of track follows the repeat mode.
  useEffect(() => {
    const a = audio.current;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      if (repeat === 'one') { a.currentTime = 0; a.play().catch(() => {}); return; }
      if (repeat === 'off' && !shuffle && index === tracks.length - 1) { want.current = false; return; }
      go(1, true);
    };
    a.addEventListener('timeupdate', onTime); a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('play', onPlay); a.addEventListener('pause', onPause); a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause); a.removeEventListener('ended', onEnded);
    };
  }, [repeat, shuffle, index, tracks.length, go]);

  // Keyboard media keys and the Windows media overlay.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', toggle);
    ms.setActionHandler('pause', toggle);
    ms.setActionHandler('nexttrack', () => go(1));
    ms.setActionHandler('previoustrack', () => go(-1));
    ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) audio.current.currentTime = d.seekTime; });
  }, [toggle, go]);

  if (!cfg.enabled) return null;

  const pickFolder = async () => {
    const folder = await api?.openFolder?.();
    if (!folder) return;
    const s = (await api?.loadSettings?.()) ?? {};
    api?.saveSettings?.({ ...s, music: { ...DEFAULT_MUSIC, ...s.music, folder } });
  };

  const vars = { '--music-accent': cfg.accent, '--music-bg': cfg.background } as CSSProperties;
  const iconBtn = 'p-1.5 rounded-md text-muted hover:text-fg transition-colors disabled:opacity-30 disabled:hover:text-muted';
  const on = { color: 'var(--music-accent)' };
  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div data-testid="music-bar" style={vars}
      className="relative h-14 shrink-0 border-t border-border bg-[var(--music-bg)] px-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 text-fg">
      {/* Now playing */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden border border-border-strong bg-background flex items-center justify-center"
          style={{ boxShadow: playing ? '0 0 12px -2px var(--music-accent)' : undefined }}>
          {meta?.cover
            ? <img src={meta.cover} alt="" data-testid="music-cover" className="w-full h-full object-cover" />
            : <Music size={16} style={on} data-testid="music-cover-placeholder" />}
        </div>
        <div className="min-w-0">
          {tracks.length ? (
            <>
              <div className="text-[12.5px] font-medium truncate" data-testid="music-title" title={meta?.title}>{meta?.title ?? '…'}</div>
              <div className="text-[11px] text-dim truncate" data-testid="music-artist">{meta?.artist ?? ''}</div>
            </>
          ) : (
            <button onClick={pickFolder} className="text-[12px] text-muted hover:text-fg text-left" data-testid="music-empty">
              {cfg.folder ? 'No audio files in this folder.' : 'No music yet.'} <span style={on}>Choose a folder</span>
            </button>
          )}
        </div>
      </div>

      {/* Transport + progress */}
      <div className="flex flex-col items-center gap-0.5 min-w-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setShuffle(v => !v)} aria-label="Shuffle" aria-pressed={shuffle} title="Shuffle" className={iconBtn} style={shuffle ? on : undefined}><Shuffle size={14} /></button>
          <button onClick={() => go(-1)} disabled={!tracks.length} aria-label="Previous track" title="Previous" className={iconBtn} data-testid="music-prev"><SkipBack size={15} /></button>
          <button onClick={toggle} disabled={!tracks.length} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} data-testid="music-play"
            className="mx-1 w-8 h-8 rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform disabled:opacity-30"
            style={{ background: 'var(--music-accent)' }}>
            {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={() => go(1)} disabled={!tracks.length} aria-label="Next track" title="Next" className={iconBtn} data-testid="music-next"><SkipForward size={15} /></button>
          <button onClick={() => setRepeat(r => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))} aria-label={`Repeat: ${repeat}`} title={`Repeat: ${repeat}`}
            className={iconBtn} style={repeat !== 'off' ? on : undefined}>{repeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}</button>
        </div>
        <div className="flex items-center gap-2 w-full max-w-[460px] font-mono text-[10.5px] text-dim">
          <span className="w-9 text-right" data-testid="music-time">{fmt(time)}</span>
          <input type="range" min={0} max={duration || 0} step={0.1} value={time} disabled={!duration} aria-label="Seek" data-testid="music-seek"
            onChange={(e) => { audio.current.currentTime = Number(e.target.value); setTime(Number(e.target.value)); }}
            className="tc-range flex-1" style={{ '--p': `${pct}%` } as CSSProperties} />
          <span className="w-9" data-testid="music-duration">{fmt(duration)}</span>
        </div>
      </div>

      {/* Queue, volume, folder */}
      <div className="flex items-center justify-end gap-1">
        <button onClick={() => setListOpen(v => !v)} disabled={!tracks.length} aria-label="Queue" title="Queue" className={iconBtn} style={listOpen ? on : undefined} data-testid="music-queue-toggle"><ListMusic size={15} /></button>
        <button onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} className={iconBtn}>
          {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume" data-testid="music-volume"
          onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
          className="tc-range w-24" style={{ '--p': `${(muted ? 0 : volume) * 100}%` } as CSSProperties} />
        <button onClick={pickFolder} aria-label="Choose music folder" title={cfg.folder || 'Choose music folder'} className={iconBtn}><FolderOpen size={15} /></button>
      </div>

      {listOpen && (
        <div data-testid="music-queue" className="absolute bottom-full right-3 mb-2 w-80 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-2xl p-1 z-50">
          <div className="px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">QUEUE · {tracks.length} TRACKS</div>
          {tracks.map((t, i) => (
            <button key={t} onClick={() => { want.current = true; setIndex(i); setListOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12px] hover:bg-surface-hover"
              style={i === index ? on : undefined}>
              <span className="w-5 shrink-0 font-mono text-[10.5px] text-dim">{i === index && playing ? '▶' : i + 1}</span>
              <span className="truncate">{baseName(t)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
