import { Mail, MapPin, Calendar, Globe, Edit3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backendUrl } from '../backend';

const DEFAULT_PROFILE = {
  name: 'You',
  email: '',
  location: '',
  joinDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  bio: 'Coding with TermiCursor.',
  github: '',
};

const inputClass = 'flex-1 bg-background border border-border-strong rounded-md px-2.5 py-1 text-[13px] text-fg focus:outline-none focus:border-primary/60';

export default function ProfilePage({ backendPort = 8000 }: { backendPort?: number }) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [profile, setProfile] = useState<typeof DEFAULT_PROFILE>(() => {
    try {
      const saved = localStorage.getItem('termicursor_profile');
      return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE;
    } catch { return DEFAULT_PROFILE; }
  });
  // Real activity, from the local session history.
  const [stats, setStats] = useState<{ sessions: number; projects: number; done: number } | null>(null);

  useEffect(() => {
    fetch(backendUrl(backendPort, '/sessions'))
      .then((r) => r.json())
      .then(({ sessions }) => {
        const list: any[] = Array.isArray(sessions) ? sessions : [];
        setStats({
          sessions: list.length,
          projects: new Set(list.map((s) => s.project_path)).size,
          done: list.filter((s) => s.status === 'done').length,
        });
      })
      .catch(() => setStats(null));
  }, [backendPort]);

  const save = () => {
    try { localStorage.setItem('termicursor_profile', JSON.stringify(profile)); } catch { /* ignore */ }
    setIsEditing(false);
  };

  const reset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    try { localStorage.removeItem('termicursor_profile'); } catch { /* ignore */ }
    setProfile(DEFAULT_PROFILE);
    setConfirmReset(false);
  };

  const fields = [
    { icon: Mail, label: 'Email', key: 'email' as const },
    { icon: MapPin, label: 'Location', key: 'location' as const },
    { icon: Globe, label: 'GitHub', key: 'github' as const },
    { icon: Calendar, label: 'Since', key: 'joinDate' as const },
  ];

  return (
    <div className="flex-1 h-full bg-background overflow-y-auto" data-testid="profile-page">
      <div className="w-full max-w-xl mx-auto px-8 pt-12 pb-16">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center font-mono text-2xl font-bold text-primary shrink-0">
            {(profile.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {isEditing
              ? <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className={`${inputClass} text-[16px] w-full`} />
              : <h1 className="text-[18px] font-semibold text-fg truncate">{profile.name}</h1>}
            {isEditing
              ? <input value={profile.bio} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} className={`${inputClass} mt-1.5 w-full`} />
              : <p className="text-[12.5px] text-dim mt-0.5">{profile.bio}</p>}
          </div>
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} title="Edit profile" className="p-1.5 rounded-md text-dim hover:text-fg hover:bg-surface-hover">
              <Edit3 size={14} />
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface divide-y divide-border mb-8">
          {fields.map(({ icon: Icon, label, key }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-2.5">
              <Icon size={14} className="text-dim shrink-0" />
              <span className="text-[12px] text-dim w-20 shrink-0">{label}</span>
              {isEditing && key !== 'joinDate'
                ? <input value={profile[key]} onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))} className={inputClass} />
                : <span className="text-[13px] text-fg truncate">{profile[key] || <span className="text-dim">—</span>}</span>}
            </div>
          ))}
        </div>

        {isEditing && (
          <div className="flex gap-2 mb-8">
            <button onClick={save} className="flex-1 py-1.5 rounded-md bg-primary text-black text-[12.5px] font-semibold hover:brightness-110">Save</button>
            <button onClick={() => setIsEditing(false)} className="px-4 py-1.5 rounded-md border border-border-strong text-[12.5px] text-muted hover:text-fg">Cancel</button>
          </div>
        )}

        <h2 className="mb-2.5 font-mono text-[11px] tracking-[0.12em] text-dim">ACTIVITY ON THIS PC</h2>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[['Sessions', stats?.sessions], ['Projects', stats?.projects], ['Completed', stats?.done]].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-border bg-surface p-4">
              <div className="font-mono text-[22px] text-fg">{value ?? '—'}</div>
              <div className="text-[11.5px] text-dim mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-dim mb-10">Counted from the agent sessions stored locally. Nothing is uploaded.</p>

        <button onClick={reset} onBlur={() => setConfirmReset(false)}
          className="w-full py-2 rounded-md border border-danger/30 text-danger text-[12.5px] hover:bg-danger/10">
          {confirmReset ? 'Click again to reset your profile' : 'Reset profile'}
        </button>
      </div>
    </div>
  );
}
