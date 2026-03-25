import { useState, useEffect, useRef } from 'react';
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';

export default function AuthPanel({
  supabase,
  session,
  loading,
  onAuthChange,
  variant = 'default',
  compact = false,
}) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localInfo, setLocalInfo] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!supabase) {
    return (
      <div className="max-w-[300px] rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-900">
        <span className="font-medium">Supabase not configured.</span> Local: add{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_URL</code> +{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_ANON_KEY</code> to{' '}
        <code className="rounded bg-amber-100/80 px-0.5">.env</code> and restart{' '}
        <code className="rounded bg-amber-100/80 px-0.5">npm run dev</code>. Vercel: Project → Settings →{' '}
        <strong>Environment Variables</strong> — add the same keys (or{' '}
        <code className="rounded bg-amber-100/80 px-0.5">NEXT_PUBLIC_SUPABASE_URL</code> + publishable/anon key), enable for{' '}
        <strong>Production</strong> and <strong>Preview</strong>, then <strong>Redeploy</strong> (build must see them). Render: Web Service →{' '}
        <strong>Environment</strong>: <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_URL</code>,{' '}
        <code className="rounded bg-amber-100/80 px-0.5">VITE_SUPABASE_ANON_KEY</code>,{' '}
        <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_SERVICE_ROLE_KEY</code>, redeploy.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={
          variant === 'sidebar'
            ? 'rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] text-white/80'
            : 'rounded-xl border border-border bg-white/80 px-3 py-2 text-xs text-muted'
        }
      >
        Checking session…
      </div>
    );
  }

  useEffect(() => {
    const currentUser = session?.user;
    if (!currentUser) return;
    setProfileName(currentUser.user_metadata?.full_name || '');
    setProfilePicture(currentUser.user_metadata?.avatar_url || '');
    setProfilePhone(currentUser.user_metadata?.phone || currentUser.phone || '');
  }, [session?.user?.id, session?.user?.user_metadata?.full_name, session?.user?.user_metadata?.avatar_url, session?.user?.user_metadata?.phone, session?.user?.phone]);

  const user = session?.user;
  if (!user) {
    return null;
  }

  const label =
    profileName.trim() ||
    user.user_metadata?.full_name ||
    user.email ||
    user.id?.slice(0, 8) ||
    'Account';
  const isSidebar = variant === 'sidebar';

  const triggerClass = isSidebar
    ? compact
      ? 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/15'
      : 'inline-flex w-full items-center justify-between gap-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1.5 text-xs text-white hover:bg-white/15'
    : 'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 shadow-sm';

  const menuClass = isSidebar
    ? compact
      ? 'absolute left-full top-0 z-[100] ml-1.5 w-[min(calc(100vw-5rem),17rem)] rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg'
      : 'absolute left-0 z-[100] mt-1.5 w-[min(calc(100vw-2rem),17rem)] rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg'
    : 'absolute right-0 z-20 mt-2 w-[280px] rounded-xl border border-border bg-white p-3 shadow-soft';

  const onAvatarFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLocalError('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLocalError('Image is too large. Please use a file under 2MB.');
      return;
    }
    setLocalError('');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });
    setProfilePicture(dataUrl);
    setLocalInfo('Image selected. Click Save settings to apply.');
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        data-sa-auth="account-menu-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label={compact ? `Account menu, signed in as ${label}` : undefined}
        className={triggerClass}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          <UserRound className={`h-4 w-4 shrink-0 ${isSidebar ? 'text-white' : ''}`} />
        {!compact ? (
          <>
            <span className={`min-w-0 truncate ${isSidebar ? 'text-white' : ''}`}>{label}</span>
          </>
        ) : null}
        </span>
        {!compact ? (
          <ChevronDown
            className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''} ${isSidebar ? 'text-white' : ''}`}
            aria-hidden
          />
        ) : null}
      </button>
      {menuOpen ? (
        <div
          className={menuClass}
          role="region"
          aria-label="Account menu"
        >
          <div className="space-y-2">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="text-sm font-medium">{label}</p>
            <button
              type="button"
              className="btn-ghost inline-flex w-full items-center justify-center gap-1"
              onClick={() => {
                setSettingsOpen((v) => !v);
                setLocalError('');
                setLocalInfo('');
              }}
            >
              <Settings className="h-4 w-4" />
              {settingsOpen ? 'Hide settings' : 'Settings'}
            </button>
            {settingsOpen ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <label className="block text-xs text-slate-700">
                  Name
                  <input
                    type="text"
                    className="input mt-1 w-full py-1 text-xs"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label className="block text-xs text-slate-700">
                  Profile picture URL
                  <input
                    type="url"
                    className="input mt-1 w-full py-1 text-xs"
                    value={profilePicture}
                    onChange={(e) => setProfilePicture(e.target.value)}
                    placeholder="https://..."
                  />
                </label>
                <label className="block text-xs text-slate-700">
                  Upload profile picture
                  <input
                    type="file"
                    accept="image/*"
                    className="input mt-1 w-full py-1 text-xs file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-2 file:py-1"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      try {
                        await onAvatarFile(file);
                      } catch (err) {
                        setLocalError(err?.message || 'Could not process image.');
                      }
                    }}
                  />
                </label>
                {profilePicture ? (
                  <div className="rounded border border-slate-200 bg-white p-2">
                    <p className="mb-1 text-[11px] text-slate-600">Preview</p>
                    <img
                      src={profilePicture}
                      alt="Profile preview"
                      className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                    />
                  </div>
                ) : null}
                <label className="block text-xs text-slate-700">
                  Phone number
                  <input
                    type="tel"
                    className="input mt-1 w-full py-1 text-xs"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setLocalError('');
                    setLocalInfo('');
                    try {
                      const { error } = await supabase.auth.updateUser({
                        data: {
                          full_name: profileName.trim(),
                          avatar_url: profilePicture.trim(),
                          phone: profilePhone.trim(),
                        },
                      });
                      if (error) throw error;
                      setLocalInfo('Profile settings saved.');
                    } catch (e) {
                      setLocalError(e?.message || 'Could not save settings.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Save settings
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="btn-ghost inline-flex w-full items-center justify-center gap-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setLocalError('');
                try {
                  await supabase.auth.signOut();
                  onAuthChange?.(null);
                  setMenuOpen(false);
                } catch (e) {
                  setLocalError(e?.message || 'Sign out failed.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
            {localInfo ? <p className="text-xs text-emerald-700">{localInfo}</p> : null}
            {localError ? <p className="text-xs text-red-700">{localError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
