import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const LOCAL_KEY = 'sa_tasks_calendar_v1';

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

function dayKeyFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority || 'medium',
    done: !!row.done,
    due_at: row.due_at,
    kind: row.kind === 'event' ? 'event' : 'task',
  };
}

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((t) => ({
      id: String(t.id),
      title: t.title || 'Untitled',
      priority: t.priority || 'medium',
      done: !!t.done,
      due_at: t.due_at || null,
      kind: t.kind === 'event' ? 'event' : 'task',
    }));
  } catch {
    return [];
  }
}

export default function TasksCalendar({ tasks, setTasks, studentId, session, setNotice }) {
  const [view, setView] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => dayKeyFromIso(new Date().toISOString()));
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('task');
  const [priority, setPriority] = useState('medium');
  const [dueLocal, setDueLocal] = useState('');
  const [editingId, setEditingId] = useState(null);
  const timeoutsRef = useRef([]);

  const email = session?.user?.email || '';

  const persistLocal = useCallback(
    (next) => {
      setTasks(next);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    },
    [setTasks],
  );

  const refreshFromCloud = useCallback(async () => {
    if (!studentId || !supabase) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('owner_id', studentId)
      .order('due_at', { ascending: true, nullsFirst: false });
    if (error) {
      setNotice?.(`Could not load tasks: ${error.message}`);
      return;
    }
    setTasks((data || []).map(mapRow));
  }, [studentId, setTasks, setNotice]);

  useEffect(() => {
    if (studentId) return;
    setTasks(loadLocalTasks());
  }, [studentId, setTasks]);

  useEffect(() => {
    if (!studentId) return;
    refreshFromCloud();
  }, [studentId, refreshFromCloud]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (!t.due_at) continue;
      const k = dayKeyFromIso(t.due_at);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return m;
  }, [tasks]);

  const selectedItems = useMemo(() => {
    if (!selectedDay) return [];
    return (byDay.get(selectedDay) || []).slice().sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  }, [byDay, selectedDay]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return tasks
      .filter((t) => !t.done && t.due_at && new Date(t.due_at).getTime() >= now)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
      .slice(0, 8);
  }, [tasks]);

  useEffect(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const now = Date.now();
    for (const t of tasks) {
      if (t.done || !t.due_at) continue;
      const due = new Date(t.due_at).getTime();
      if (Number.isNaN(due) || due <= now) continue;

      const schedule = (offsetMs, label) => {
        const fireAt = due - offsetMs;
        if (fireAt <= now) return;
        const id = window.setTimeout(() => {
          try {
            new Notification('Student Assistant', {
              body: `${label} until due: ${t.title}`,
              tag: `${t.id}-${label}`,
            });
          } catch {
            /* ignore */
          }
        }, fireAt - now);
        timeoutsRef.current.push(id);
      };

      schedule(60 * 60 * 1000, '1 hour');
      schedule(10 * 60 * 1000, '10 minutes');
    }

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [tasks]);

  const requestNotify = async () => {
    if (typeof Notification === 'undefined') {
      setNotice?.('Notifications are not supported in this browser.');
      return;
    }
    const p = await Notification.requestPermission();
    if (p !== 'granted') setNotice?.('Notifications were blocked — enable them in the browser for 1h / 10m alerts.');
    else setNotice?.('Browser reminders enabled (while this tab is open).');
  };

  const openNewForDay = (dayKey) => {
    setSelectedDay(dayKey);
    setEditingId(null);
    setTitle('');
    setKind('task');
    setPriority('medium');
    const base = dayKey ? new Date(`${dayKey}T12:00`) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    setDueLocal(
      `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`,
    );
    setFormOpen(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setTitle(t.title);
    setKind(t.kind || 'task');
    setPriority(t.priority || 'medium');
    setSelectedDay(dayKeyFromIso(t.due_at) || selectedDay);
    if (t.due_at) {
      const d = new Date(t.due_at);
      const pad = (n) => String(n).padStart(2, '0');
      setDueLocal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else setDueLocal('');
    setFormOpen(true);
  };

  const saveTask = async () => {
    if (!title.trim()) {
      setNotice?.('Add a title.');
      return;
    }
    const dueDate = dueLocal ? new Date(dueLocal) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      setNotice?.('Invalid date/time.');
      return;
    }
    const dueIso = dueDate ? dueDate.toISOString() : null;
    const effPriority = kind === 'event' ? 'medium' : priority;

    if (studentId && supabase) {
      const row = {
        owner_id: studentId,
        title: title.trim(),
        priority: effPriority,
        kind,
        due_at: dueIso,
        done: false,
        reminder_1h_sent: false,
        reminder_10m_sent: false,
      };
      try {
        if (editingId && isUuid(editingId)) {
          const existing = tasks.find((x) => x.id === editingId);
          const { error } = await supabase
            .from('tasks')
            .update({
              title: row.title,
              priority: row.priority,
              kind: row.kind,
              due_at: row.due_at,
              reminder_1h_sent: false,
              reminder_10m_sent: false,
              done: existing?.done ?? false,
            })
            .eq('id', editingId)
            .eq('owner_id', studentId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('tasks').insert(row);
          if (error) throw error;
        }
        await refreshFromCloud();
      } catch (e) {
        setNotice?.(e?.message || 'Could not save task.');
        return;
      }
    } else {
      const id = editingId || `local-${Date.now()}`;
      const next = tasks.filter((x) => x.id !== id);
      const item = {
        id,
        title: title.trim(),
        priority: effPriority,
        done: false,
        due_at: dueIso,
        kind,
      };
      if (editingId) {
        const old = tasks.find((x) => x.id === editingId);
        if (old) item.done = old.done;
      }
      persistLocal([item, ...next]);
    }

    setFormOpen(false);
    setEditingId(null);
    setTitle('');
  };

  const deleteTask = async (t) => {
    if (!window.confirm(`Delete “${t.title}”?`)) return;
    if (studentId && supabase && isUuid(t.id)) {
      const { error } = await supabase.from('tasks').delete().eq('id', t.id).eq('owner_id', studentId);
      if (error) {
        setNotice?.(error.message);
        return;
      }
      await refreshFromCloud();
    } else {
      persistLocal(tasks.filter((x) => x.id !== t.id));
    }
    if (editingId === t.id) {
      setFormOpen(false);
      setEditingId(null);
    }
  };

  const toggleDone = async (t) => {
    if (studentId && supabase && isUuid(t.id)) {
      const { error } = await supabase.from('tasks').update({ done: !t.done }).eq('id', t.id).eq('owner_id', studentId);
      if (error) {
        setNotice?.(error.message);
        return;
      }
      await refreshFromCloud();
    } else {
      persistLocal(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    }
  };

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const prevMonth = () => setView(new Date(year, month - 1, 1));
  const nextMonth = () => setView(new Date(year, month + 1, 1));

  const monthLabel = view.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <section className="panel">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Tasks & calendar</h3>
            <p className="mt-1 text-sm text-muted">
              See what’s due by day. Add <strong>tasks</strong> or your own <strong>events</strong> with date &amp; time. We’ll remind you{' '}
              <strong>1 hour</strong> and <strong>10 minutes</strong> before (browser alerts while the app is open; email if the server has SMTP
              configured).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost inline-flex items-center gap-2 text-sm" onClick={requestNotify}>
              <Bell size={16} />
              Enable browser alerts
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2 text-sm"
              onClick={() => openNewForDay(selectedDay || dayKeyFromIso(new Date().toISOString()))}
            >
              <Plus size={16} />
              New task / event
            </button>
          </div>
        </div>

        {!studentId ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Sign in to sync tasks to your account and receive <strong>email</strong> reminders (with SMTP on the API server). Local-only tasks are saved in
            this browser.
          </p>
        ) : (
          <p className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-950">
            Signed in as <strong>{email || 'your account'}</strong>. Email reminders use your login email when <code className="rounded bg-white/80 px-1">SMTP_*</code>{' '}
            is set on the Node server.
          </p>
        )}

        {!isSupabaseConfigured() && studentId ? (
          <p className="mb-3 text-sm text-amber-800">Supabase env keys are missing — cloud sync disabled.</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <button type="button" className="btn-ghost p-2" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <CalendarDays size={20} className="text-indigo-600" />
            {monthLabel}
          </div>
          <button type="button" className="btn-ghost p-2" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, idx) => {
            if (d == null) {
              return <div key={`e-${idx}`} className="min-h-[72px] rounded-lg bg-slate-50/50" />;
            }
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const list = byDay.get(key) || [];
            const active = selectedDay === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(key)}
                onDoubleClick={() => openNewForDay(key)}
                className={`flex min-h-[72px] flex-col items-stretch rounded-lg border p-1 text-left transition-colors ${
                  active ? 'border-indigo-500 bg-indigo-50/90 ring-1 ring-indigo-200' : 'border-border bg-white/90 hover:bg-indigo-50/40'
                }`}
              >
                <span className="text-xs font-semibold text-slate-800">{d}</span>
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {list.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className={`h-1.5 max-w-full flex-1 rounded-full ${t.kind === 'event' ? 'bg-sky-500' : 'bg-indigo-500'} ${t.done ? 'opacity-40' : ''}`}
                      title={t.title}
                    />
                  ))}
                  {list.length > 3 ? (
                    <span className="w-full text-[10px] text-muted">+{list.length - 3}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Tip: double-click a day to create an item on that date.</p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel">
          <h4 className="mb-2 font-semibold text-slate-900">On {selectedDay || '—'}</h4>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-muted">Nothing due this day. Add a task or event.</p>
          ) : (
            <ul className="space-y-2">
              {selectedItems.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  <input type="checkbox" checked={t.done} onChange={() => toggleDone(t)} />
                  <button type="button" className="text-left font-medium text-slate-900 underline-offset-2 hover:underline" onClick={() => openEdit(t)}>
                    {t.title}
                  </button>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-muted">{t.kind === 'event' ? 'Event' : 'Task'}</span>
                  <span className="text-xs text-muted">{formatTime(t.due_at)}</span>
                  <button type="button" className="ml-auto text-rose-600 hover:text-rose-800" title="Delete" onClick={() => deleteTask(t)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h4 className="mb-2 font-semibold text-slate-900">Upcoming</h4>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">No upcoming due dates.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{t.title}</div>
                    <div className="text-xs text-muted">
                      {formatTime(t.due_at)} · {t.kind === 'event' ? 'Event' : 'Task'}
                    </div>
                  </div>
                  <button type="button" className="btn-ghost text-xs" onClick={() => openEdit(t)}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
        >
          <div
            className="panel max-h-[90vh] w-full max-w-md overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="mb-3 text-lg font-semibold">{editingId ? 'Edit' : 'New'} task or event</h4>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-muted">Title</span>
                <input className="input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam review, club meeting…" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-muted">Type</span>
                  <select className="input mt-1 w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="task">Task</option>
                    <option value="event">My event</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Priority</span>
                  <select className="input mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={kind === 'event'}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-muted">Due date &amp; time</span>
                <input className="input mt-1 w-full" type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" className="btn-primary" onClick={saveTask}>
                  Save
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="btn-ghost text-rose-700"
                    onClick={() => {
                      const t = tasks.find((x) => x.id === editingId);
                      if (t) deleteTask(t);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
