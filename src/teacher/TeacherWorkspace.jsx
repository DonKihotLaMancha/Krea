import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

function errorMessageFromBody(data, resp, rawText) {
  if (data && typeof data === 'object') {
    const detail = data.details;
    const detailStr =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object'
          ? detail.message || detail.msg || null
          : null;
    const msg =
      data.error ||
      data.message ||
      detailStr ||
      (typeof data.detail === 'string' ? data.detail : null);
    if (msg) return String(msg).trim();
  }
  const snippet = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (snippet && !snippet.startsWith('<')) return snippet;
  const status = resp.status;
  const reason = resp.statusText || '';
  return `Request failed (${status}${reason ? ` ${reason}` : ''}).`;
}

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, options);
  const rawText = await resp.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }
  if (!resp.ok) {
    throw new Error(errorMessageFromBody(data, resp, rawText));
  }
  return data ?? {};
}

const paneLabels = {
  dashboard: 'Dashboard',
  materials: 'Materials',
  quizzes: 'Quiz builder',
  assignments: 'Assignments',
  progress: 'Class progress',
  announcements: 'Announcements',
  grading: 'Grading',
};

export default function TeacherWorkspace() {
  const { session, setNotice, activePane } = useOutletContext();
  const teacherId = session?.user?.id ?? null;

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [className, setClassName] = useState('');
  const [classDescription, setClassDescription] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialContent, setMaterialContent] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentDueAt, setAssignmentDueAt] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [gradeStudentId, setGradeStudentId] = useState('');
  const [gradeAssignmentId, setGradeAssignmentId] = useState('');
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizCount, setQuizCount] = useState(10);
  const [quizPrompt, setQuizPrompt] = useState('');
  const [latestQuiz, setLatestQuiz] = useState(null);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId],
  );

  const loadTeacherCore = async () => {
    if (!teacherId) return;
    setBusy(true);
    setError('');
    try {
      const [{ classes: cls }, { stats }] = await Promise.all([
        apiFetch(`/api/teacher/classes?teacherId=${encodeURIComponent(teacherId)}`),
        apiFetch(`/api/teacher/dashboard?teacherId=${encodeURIComponent(teacherId)}`),
      ]);
      setClasses(cls || []);
      setDashboard(stats || null);
      if (!selectedClassId && cls?.[0]?.id) setSelectedClassId(cls[0].id);
    } catch (err) {
      setError(err.message);
      setNotice?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadTeacherCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId || !selectedClassId) return;
    const loadClassData = async () => {
      try {
        const [mat, ass, ann, prog] = await Promise.all([
          apiFetch(`/api/teacher/materials?teacherId=${encodeURIComponent(teacherId)}&classId=${encodeURIComponent(selectedClassId)}`),
          apiFetch(`/api/teacher/assignments?teacherId=${encodeURIComponent(teacherId)}&classId=${encodeURIComponent(selectedClassId)}`),
          apiFetch(`/api/teacher/announcements?teacherId=${encodeURIComponent(teacherId)}&classId=${encodeURIComponent(selectedClassId)}`),
          apiFetch(`/api/teacher/progress?teacherId=${encodeURIComponent(teacherId)}&classId=${encodeURIComponent(selectedClassId)}`),
        ]);
        setMaterials(mat.materials || []);
        setAssignments(ass.assignments || []);
        setAnnouncements(ann.announcements || []);
        setProgress(prog.progress || null);
      } catch (err) {
        setError(err.message);
      }
    };
    loadClassData();
  }, [teacherId, selectedClassId]);

  if (!teacherId) {
    return null;
  }

  const needsClass = ['materials', 'quizzes', 'assignments', 'progress', 'announcements', 'grading'].includes(activePane);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">{paneLabels[activePane] || 'Teacher'}</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">{paneLabels[activePane] || 'Overview'}</h2>
          {selectedClass ? (
            <p className="mt-1 text-sm text-slate-600">
              {selectedClass.name} <span className="text-slate-400">·</span> {selectedClass.code}
            </p>
          ) : (
            <p className="mt-1 text-sm text-amber-800">Create a class from the dashboard or pick one below.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="teacher-class-select">
            Active class
          </label>
          <select
            id="teacher-class-select"
            className="input min-w-[200px]"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={loadTeacherCore} disabled={busy}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {needsClass && !selectedClassId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Select a class to use this section, or create one from the dashboard.
        </div>
      ) : null}

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {activePane === 'dashboard' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Classes</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{dashboard?.classes ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Assignments</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{dashboard?.assignments ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Announcements</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{dashboard?.announcements ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Submissions</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{dashboard?.submissions ?? 0}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Create class</p>
            <p className="mt-1 text-xs text-slate-500">New classes get a shareable code for students.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input className="input" placeholder="Class name" value={className} onChange={(e) => setClassName(e.target.value)} />
              <input className="input" placeholder="Description" value={classDescription} onChange={(e) => setClassDescription(e.target.value)} />
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  if (!className.trim()) return;
                  setBusy(true);
                  try {
                    const data = await apiFetch('/api/teacher/classes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ teacherId, name: className, description: classDescription }),
                    });
                    setClasses((prev) => [data.class, ...prev]);
                    setSelectedClassId(data.class.id);
                    setClassName('');
                    setClassDescription('');
                    setNotice?.('Class created.');
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                Create class
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activePane === 'materials' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Add class material</p>
            <input className="input mb-2 mt-3" placeholder="Material title" value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} />
            <textarea className="input min-h-24" placeholder="Material text / summary" value={materialContent} onChange={(e) => setMaterialContent(e.target.value)} />
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={async () => {
                if (!selectedClassId || !materialTitle.trim()) return;
                try {
                  const data = await apiFetch('/api/teacher/materials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      teacherId,
                      classId: selectedClassId,
                      title: materialTitle,
                      content: materialContent,
                      materialType: 'note',
                    }),
                  });
                  setMaterials((prev) => [data.material, ...prev]);
                  setMaterialTitle('');
                  setMaterialContent('');
                  setNotice?.('Material saved.');
                } catch (err) {
                  setError(err.message);
                }
              }}
              disabled={!selectedClassId}
            >
              Save material
            </button>
          </div>
          <ul className="space-y-2">
            {materials.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No materials yet.</li>
            ) : (
              materials.map((m) => (
                <li key={m.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                  <strong className="text-slate-900">{m.title}</strong>
                  <p className="mt-1 text-slate-600">{String(m.content || '').slice(0, 220) || 'No preview text.'}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {activePane === 'quizzes' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Generate class quiz (AI)</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input className="input" placeholder="Quiz title" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} />
            <select className="input" value={quizDifficulty} onChange={(e) => setQuizDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <input className="input" type="number" min="3" max="30" value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value || 10))} />
          </div>
          <textarea className="input mt-2 min-h-24" placeholder="Optional prompt focus" value={quizPrompt} onChange={(e) => setQuizPrompt(e.target.value)} />
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={async () => {
              if (!selectedClassId) return;
              try {
                const data = await apiFetch('/api/teacher/quiz-generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    teacherId,
                    classId: selectedClassId,
                    title: quizTitle || `Quiz - ${selectedClass?.name || 'Class'}`,
                    difficulty: quizDifficulty,
                    count: quizCount,
                    promptText: quizPrompt,
                  }),
                });
                setLatestQuiz(data.quiz);
                setNotice?.('Teacher quiz generated.');
              } catch (err) {
                setError(err.message);
              }
            }}
            disabled={!selectedClassId}
          >
            Generate quiz
          </button>
          {latestQuiz ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <strong>{latestQuiz.title}</strong> ({latestQuiz.difficulty}, {latestQuiz.question_count} questions)
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {activePane === 'assignments' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Create assignment</p>
            <input className="input mb-2 mt-3" placeholder="Assignment title" value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} />
            <textarea className="input mb-2 min-h-20" placeholder="Assignment details" value={assignmentDescription} onChange={(e) => setAssignmentDescription(e.target.value)} />
            <input className="input" type="datetime-local" value={assignmentDueAt} onChange={(e) => setAssignmentDueAt(e.target.value)} />
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={async () => {
                if (!selectedClassId || !assignmentTitle.trim()) return;
                try {
                  const data = await apiFetch('/api/teacher/assignments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      teacherId,
                      classId: selectedClassId,
                      title: assignmentTitle,
                      description: assignmentDescription,
                      dueAt: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
                    }),
                  });
                  setAssignments((prev) => [data.assignment, ...prev]);
                  setAssignmentTitle('');
                  setAssignmentDescription('');
                  setAssignmentDueAt('');
                  setNotice?.('Assignment created.');
                } catch (err) {
                  setError(err.message);
                }
              }}
              disabled={!selectedClassId}
            >
              Publish assignment
            </button>
          </div>
          <ul className="space-y-2">
            {assignments.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No assignments yet.</li>
            ) : (
              assignments.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                  <strong className="text-slate-900">{a.title}</strong> <span className="text-xs text-slate-500">({a.status})</span>
                  <p className="mt-1 text-slate-600">{a.description || 'No description.'}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {activePane === 'progress' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Students</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{progress?.enrolled ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Assignments</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{progress?.assignments ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Graded entries</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{progress?.gradedEntries ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Average score</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{progress?.averageScore ?? 0}</p>
          </div>
        </div>
      ) : null}

      {activePane === 'announcements' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Post announcement</p>
            <input className="input mb-2 mt-3" placeholder="Title" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} />
            <textarea className="input min-h-20" placeholder="Message" value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} />
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={async () => {
                if (!selectedClassId || !announcementTitle.trim() || !announcementMessage.trim()) return;
                try {
                  const data = await apiFetch('/api/teacher/announcements', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      teacherId,
                      classId: selectedClassId,
                      title: announcementTitle,
                      message: announcementMessage,
                    }),
                  });
                  setAnnouncements((prev) => [data.announcement, ...prev]);
                  setAnnouncementTitle('');
                  setAnnouncementMessage('');
                  setNotice?.('Announcement published.');
                } catch (err) {
                  setError(err.message);
                }
              }}
              disabled={!selectedClassId}
            >
              Publish announcement
            </button>
          </div>
          <ul className="space-y-2">
            {announcements.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No announcements yet.</li>
            ) : (
              announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                  <strong className="text-slate-900">{a.title}</strong>
                  <p className="mt-1 text-slate-600">{a.message}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {activePane === 'grading' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Record a grade</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input className="input" placeholder="Student UUID" value={gradeStudentId} onChange={(e) => setGradeStudentId(e.target.value)} />
            <input className="input" placeholder="Assignment UUID (optional)" value={gradeAssignmentId} onChange={(e) => setGradeAssignmentId(e.target.value)} />
            <input className="input" type="number" min="0" max="100" placeholder="Score" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} />
            <input className="input" placeholder="Feedback" value={gradeFeedback} onChange={(e) => setGradeFeedback(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={async () => {
              if (!selectedClassId || !gradeStudentId.trim() || !gradeScore) return;
              try {
                await apiFetch('/api/teacher/grading', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    teacherId,
                    classId: selectedClassId,
                    studentId: gradeStudentId.trim(),
                    assignmentId: gradeAssignmentId.trim() || null,
                    score: Number(gradeScore),
                    feedback: gradeFeedback,
                  }),
                });
                setGradeStudentId('');
                setGradeAssignmentId('');
                setGradeScore('');
                setGradeFeedback('');
                setNotice?.('Grade recorded.');
              } catch (err) {
                setError(err.message);
              }
            }}
            disabled={!selectedClassId}
          >
            Save grade
          </button>
        </div>
      ) : null}
    </div>
  );
}
