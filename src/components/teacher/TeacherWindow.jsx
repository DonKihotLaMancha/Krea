import { useEffect, useMemo, useState } from 'react';

const panes = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'materials', label: 'Materials' },
  { id: 'quizzes', label: 'Quiz Builder' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'progress', label: 'Progress' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'grading', label: 'Grading' },
];

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || data?.details?.message || 'Request failed.');
  }
  return data;
}

export default function TeacherWindow({ teacherId, setNotice }) {
  const [activePane, setActivePane] = useState('dashboard');
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
    return (
      <section className="panel">
        <h3 className="text-lg font-semibold">Teacher Window</h3>
        <p className="mt-2 text-sm text-muted">
          Sign in first to open teacher tools (classes, assignments, grading, analytics).
        </p>
      </section>
    );
  }

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Teacher Window</h3>
          <p className="text-xs text-muted">Manage classes, materials, assignments, grading and analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={loadTeacherCore} disabled={busy}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {panes.map((pane) => (
          <button
            key={pane.id}
            className={activePane === pane.id ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setActivePane(pane.id)}
          >
            {pane.label}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {activePane === 'dashboard' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Classes</p><p className="text-2xl font-semibold">{dashboard?.classes ?? 0}</p></div>
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Assignments</p><p className="text-2xl font-semibold">{dashboard?.assignments ?? 0}</p></div>
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Announcements</p><p className="text-2xl font-semibold">{dashboard?.announcements ?? 0}</p></div>
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Submissions</p><p className="text-2xl font-semibold">{dashboard?.submissions ?? 0}</p></div>
          <div className="md:col-span-4 rounded-xl border border-border bg-white p-3">
            <p className="mb-2 text-sm font-medium">Create class</p>
            <div className="flex flex-wrap gap-2">
              <input className="input" placeholder="Class name" value={className} onChange={(e) => setClassName(e.target.value)} />
              <input className="input" placeholder="Description" value={classDescription} onChange={(e) => setClassDescription(e.target.value)} />
              <button
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
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="mb-2 text-sm font-medium">Add class material</p>
            <input className="input mb-2" placeholder="Material title" value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} />
            <textarea className="input min-h-24" placeholder="Material text / summary" value={materialContent} onChange={(e) => setMaterialContent(e.target.value)} />
            <button
              className="btn-primary mt-2"
              onClick={async () => {
                if (!selectedClassId || !materialTitle.trim()) return;
                try {
                  const data = await apiFetch('/api/teacher/materials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teacherId, classId: selectedClassId, title: materialTitle, content: materialContent, materialType: 'note' }),
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
            {materials.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <strong>{m.title}</strong>
                <p className="mt-1 text-muted">{String(m.content || '').slice(0, 220) || 'No preview text.'}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activePane === 'quizzes' ? (
        <div className="rounded-xl border border-border bg-white p-3">
          <p className="mb-2 text-sm font-medium">Generate class quiz (AI)</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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
            className="btn-primary mt-2"
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
            <div className="mt-3 rounded-lg border border-border bg-slate-50 p-3 text-sm">
              <p><strong>{latestQuiz.title}</strong> ({latestQuiz.difficulty}, {latestQuiz.question_count} questions)</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {activePane === 'assignments' ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="mb-2 text-sm font-medium">Create assignment</p>
            <input className="input mb-2" placeholder="Assignment title" value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} />
            <textarea className="input mb-2 min-h-20" placeholder="Assignment details" value={assignmentDescription} onChange={(e) => setAssignmentDescription(e.target.value)} />
            <input className="input" type="datetime-local" value={assignmentDueAt} onChange={(e) => setAssignmentDueAt(e.target.value)} />
            <button
              className="btn-primary mt-2"
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
            {assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <strong>{a.title}</strong> <span className="text-xs text-muted">({a.status})</span>
                <p className="mt-1 text-muted">{a.description || 'No description.'}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activePane === 'progress' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Students</p><p className="text-2xl font-semibold">{progress?.enrolled ?? 0}</p></div>
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Assignments</p><p className="text-2xl font-semibold">{progress?.assignments ?? 0}</p></div>
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Graded entries</p><p className="text-2xl font-semibold">{progress?.gradedEntries ?? 0}</p></div>
          <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Average score</p><p className="text-2xl font-semibold">{progress?.averageScore ?? 0}</p></div>
        </div>
      ) : null}

      {activePane === 'announcements' ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-white p-3">
            <p className="mb-2 text-sm font-medium">Post announcement</p>
            <input className="input mb-2" placeholder="Title" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} />
            <textarea className="input min-h-20" placeholder="Message" value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} />
            <button
              className="btn-primary mt-2"
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
            {announcements.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                <strong>{a.title}</strong>
                <p className="mt-1 text-muted">{a.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activePane === 'grading' ? (
        <div className="rounded-xl border border-border bg-white p-3">
          <p className="mb-2 text-sm font-medium">Record a grade</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input className="input" placeholder="Student UUID" value={gradeStudentId} onChange={(e) => setGradeStudentId(e.target.value)} />
            <input className="input" placeholder="Assignment UUID (optional)" value={gradeAssignmentId} onChange={(e) => setGradeAssignmentId(e.target.value)} />
            <input className="input" type="number" min="0" max="100" placeholder="Score" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} />
            <input className="input" placeholder="Feedback" value={gradeFeedback} onChange={(e) => setGradeFeedback(e.target.value)} />
          </div>
          <button
            className="btn-primary mt-2"
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
    </section>
  );
}

