import { Mail, MapPin, Calendar, ExternalLink, Edit3, Globe } from 'lucide-react';
import { useState } from 'react';

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    name: 'Shreyash M.',
    email: 'shreyash@example.com',
    location: 'India',
    joinDate: 'May 2026',
    bio: 'Full-stack developer passionate about AI-powered developer tools.',
    github: 'MShreyash09',
  });

  return (
    <div className="flex-1 h-full bg-[#031c1d] flex flex-col items-center pt-24 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#424242 transparent' }}>
      {/* Profile Card */}
      <div className="w-full max-w-lg px-6">
        {/* Avatar + Name */}
        <div className="flex items-start gap-5 mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center text-3xl font-bold text-white shrink-0 shadow-lg shadow-cyan-500/20">
            {profile.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold text-gray-100">{profile.name}</h1>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Edit Profile"
              >
                <Edit3 size={14} />
              </button>
            </div>
            <p className="text-sm text-gray-400">{profile.bio}</p>
          </div>
        </div>

        {/* Info Fields */}
        <div className="space-y-1 mb-8">
          {[
            { icon: Mail, label: 'Email', value: profile.email, key: 'email' },
            { icon: MapPin, label: 'Location', value: profile.location, key: 'location' },
            { icon: Calendar, label: 'Member since', value: profile.joinDate, key: 'joinDate' },
            { icon: Globe, label: 'GitHub', value: profile.github, key: 'github' },
          ].map(({ icon: Icon, label, value, key }) => (
            <div key={key} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group">
              <Icon size={16} className="text-gray-500 shrink-0" />
              <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
              {isEditing ? (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setProfile(prev => ({ ...prev, [key]: e.target.value }))}
                  className="flex-1 bg-[#0b2b2d] border border-[#1a4042] rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-[#2b6b69]"
                />
              ) : (
                <span className="text-sm text-gray-200">{value}</span>
              )}
              {key === 'github' && !isEditing && (
                <ExternalLink size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors ml-auto cursor-pointer" />
              )}
            </div>
          ))}
        </div>

        {/* Save Button (when editing) */}
        {isEditing && (
          <div className="flex gap-3 px-4 mb-8">
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 py-2 bg-[#1e4b4a] hover:bg-[#255c5a] text-white rounded border border-[#2b6b69] text-sm transition-colors cursor-pointer"
            >
              Save Changes
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-6 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 rounded border border-[#3a3a3a] text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="border-t border-[#1a3a3a] pt-6 px-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Activity</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Projects', value: '12' },
              { label: 'Queries', value: '284' },
              { label: 'Hours', value: '47' },
            ].map(stat => (
              <div key={stat.label} className="bg-[#052122] border border-[#0f3435] rounded-lg p-4 text-center">
                <div className="text-xl font-semibold text-gray-100">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sign Out */}
        <div className="px-4 mt-8 mb-12">
          <button className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded border border-red-500/20 text-sm transition-colors cursor-pointer">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
