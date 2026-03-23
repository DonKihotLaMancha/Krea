import { useEffect, useMemo, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import AppShell from './components/AppShell';
import UploadCard from './components/UploadCard';
import FlashcardDeck from './components/FlashcardDeck';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const tabs = ['Ingest', 'Flashcards', 'Tasks', 'Quizzes', 'Chat', 'Presentations', 'Academics', 'AI Tutor'];

function cleanAcademicText(raw) {
  return (raw || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeGibberish(text) {
  if (!text) return true;
  const sample = text.slice(0, 2000);
  const weird = (sample.match(/[<>{}[\]\\/|~`]/g) || []).length;
  const alpha = (sample.match(/[A-Za-z]/g) || []).length;
  return alpha < 80 || weird / Math.max(sample.length, 1) > 0.1;
}

function fallbackCardsFromText(raw) {
  const cleaned = cleanAcademicText(raw);
  const completeSentences = cleaned.match(/[^.!?]+[.!?]/g) || [];
  return completeSentences
    .map((s) => s.trim())
    .filter((s) => s.length > 45 && s.length < 260)
    .slice(0, 12)
    .map((text, i) => ({
      id: `${Date.now()}-${i}`,
      question: `What is the key idea of this statement?`,
      answer: text,
      right: 0,
      wrong: 0,
    }));
}

async function generateCardsWithOllama(text) {
  const resp = await fetch('/api/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error('Ollama API error');
  const data = await resp.json();
  return Array.isArray(data.cards) ? data.cards : [];
}

async function extractPdfText(file, onProgress) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  let allText = '';
  const totalPages = Math.max(pdf.numPages, 1);
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const content = await p.getTextContent();
    let pageText = '';
    let lastY = null;
    for (const item of content.items) {
      const str = item.str || '';
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) pageText += '\n';
      else if (pageText && !pageText.endsWith('\n')) pageText += ' ';
      pageText += str;
      lastY = y;
    }
    allText += `${pageText}\n`;
    if (onProgress) {
      onProgress({
        phase: 'extract',
        progress: Math.round((page / totalPages) * 100),
        label: `Reading PDF page ${page} of ${totalPages}...`,
      });
    }
  }
  return allText;
}

async function fileToText(file, onProgress) {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return extractPdfText(file, onProgress);
  const buffer = await file.arrayBuffer();
  if (ext === 'txt' || ext === 'md' || ext === 'csv') return new TextDecoder().decode(buffer);
  return '';
}

export default function App() {
  const [tab, setTab] = useState('Ingest');
  const [chunks, setChunks] = useState([]);
  const [cards, setCards] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [messages, setMessages] = useState([]);
  const [room, setRoom] = useState('global');
  const [presentations, setPresentations] = useState([]);
  const [grades, setGrades] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [tutorMessages, setTutorMessages] = useState([]);
  const [notice, setNotice] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestBatchAt, setLatestBatchAt] = useState(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState('');
  const [generationIndeterminate, setGenerationIndeterminate] = useState(false);
  const [modelStatus, setModelStatus] = useState({ ok: false, model: 'qwen2.5:7b' });
  const [quizConfig, setQuizConfig] = useState({ mode: 'quiz', difficulty: 'medium', count: 10 });

  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        if (mounted) setModelStatus({ ok: !!data.ok, model: data.model || 'qwen2.5:7b' });
      } catch {
        if (mounted) setModelStatus({ ok: false, model: 'qwen2.5:7b' });
      }
    };
    ping();
    const id = setInterval(ping, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const avg = useMemo(() => {
    const w = grades.reduce((s, g) => s + g.weight, 0);
    if (!w) return 0;
    return grades.reduce((s, g) => s + g.score * g.weight, 0) / w;
  }, [grades]);

  const stats = {
    cardsCount: cards.length,
    tasksDone: tasks.filter((t) => t.done).length,
    tasksTotal: tasks.length,
    avg,
  };

  const generateForChunk = async (chunk, { append = false } = {}) => {
    setIsGenerating(true);
    setGenerationProgress(100);
    setGenerationIndeterminate(true);
    setGenerationStage('AI is generating flashcards...');
    setNotice('Generating your study set...');
    try {
      const aiCards = await generateCardsWithOllama(chunk.content);
      if (aiCards.length) {
        setCards((prev) => (append ? [...prev, ...aiCards] : aiCards));
        setLatestBatchAt(new Date().toLocaleTimeString());
        setShowAnswer(false);
        setGenerationIndeterminate(false);
        setGenerationProgress(100);
        setGenerationStage('Completed');
        setNotice(
          append
            ? `Generated ${aiCards.length} more AI flashcards.`
            : `Generated ${aiCards.length} AI flashcards.`,
        );
        return;
      }
      const fallback = fallbackCardsFromText(chunk.content);
      setCards((prev) => (append ? [...prev, ...fallback] : fallback));
      setLatestBatchAt(new Date().toLocaleTimeString());
      setGenerationIndeterminate(false);
      setGenerationProgress(100);
      setGenerationStage('Completed');
      setNotice(
        append
          ? `AI returned no cards. Added ${fallback.length} backup flashcards.`
          : `AI returned no cards. Generated ${fallback.length} backup cards.`,
      );
    } catch {
      setGenerationIndeterminate(true);
      setGenerationStage('AI unavailable, switching to backup mode...');
      const fallback = fallbackCardsFromText(chunk.content);
      setCards((prev) => (append ? [...prev, ...fallback] : fallback));
      setLatestBatchAt(new Date().toLocaleTimeString());
      setGenerationIndeterminate(false);
      setGenerationProgress(100);
      setGenerationStage('Completed');
      setNotice(
        append
          ? `AI model offline — added ${fallback.length} backup cards.`
          : `AI model offline — using backup mode (${fallback.length} cards).`,
      );
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationStage('');
        setGenerationIndeterminate(false);
      }, 900);
    }
  };

  const onFileUpload = async (file) => {
    setGenerationIndeterminate(false);
    setGenerationProgress(5);
    setGenerationStage('Uploading file...');
    const text = await fileToText(file, ({ progress, label }) => {
      setGenerationIndeterminate(false);
      setGenerationProgress(progress);
      setGenerationStage(label);
    });
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setGenerationProgress(100);
      setGenerationStage('Preparing extracted text...');
    }
    const cleaned = cleanAcademicText(text);
    if (!cleaned || looksLikeGibberish(cleaned)) {
      setNotice('Could not extract readable text. Use a text-based PDF/TXT.');
      setGenerationProgress(0);
      setGenerationStage('');
      return;
    }
    const chunk = { id: `${Date.now()}`, name: file.name, content: cleaned };
    setChunks((prev) => [chunk, ...prev]);
    await generateForChunk(chunk);
  };

  const markCard = (ok) => {
    const currentCard = cards[0];
    if (!currentCard) return;
    setCards((prev) => {
      const [head, ...rest] = prev;
      const updated = { ...head, right: head.right + (ok ? 1 : 0), wrong: head.wrong + (!ok ? 1 : 0) };
      return ok ? [...rest, updated] : [updated, ...rest];
    });
    setShowAnswer(false);
  };

  const generateQuiz = () => {
    setQuizResults((prev) => [
      {
        id: Date.now(),
        topic: quizConfig.mode.toUpperCase(),
        total: Number(quizConfig.count),
        correct: Math.round(Number(quizConfig.count) * 0.75),
        sec: 120,
        difficulty: quizConfig.difficulty,
      },
      ...prev,
    ]);
  };

  const gradesChartData = {
    labels: grades.map((g) => g.subject).reverse(),
    datasets: [
      {
        label: 'Score',
        data: grades.map((g) => g.score).reverse(),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.2)',
      },
    ],
  };

  const requiredFinal = simulations[0]?.req ?? 0;
  const kpiData = {
    labels: ['Current Avg', 'Required Final'],
    datasets: [
      { data: [avg || 0, requiredFinal || 0], backgroundColor: ['#2563eb', '#10b981'] },
    ],
  };

  return (
    <AppShell
      tabs={tabs}
      tab={tab}
      setTab={setTab}
      modelStatus={modelStatus}
      latestBatchAt={latestBatchAt}
      notice={notice}
      stats={stats}
    >
      {tab === 'Ingest' ? (
        <UploadCard
          onFile={onFileUpload}
          onGenerateLatest={() => chunks[0] && generateForChunk(chunks[0])}
          chunks={chunks}
          isGenerating={isGenerating}
          progress={generationProgress}
          progressLabel={generationStage}
          isIndeterminate={generationIndeterminate}
        />
      ) : null}

      {tab === 'Flashcards' ? (
        <FlashcardDeck
          cards={cards}
          showAnswer={showAnswer}
          setShowAnswer={setShowAnswer}
          onRight={() => markCard(true)}
          onWrong={() => markCard(false)}
          latestBatchAt={latestBatchAt}
          onGenerateMore={() => chunks[0] && generateForChunk(chunks[0], { append: true })}
          onClear={() => {
            setCards([]);
            setLatestBatchAt(null);
          }}
        />
      ) : null}

      {tab === 'Tasks' ? <Tasks tasks={tasks} setTasks={setTasks} /> : null}
      {tab === 'Quizzes' ? <Quizzes config={quizConfig} setConfig={setQuizConfig} onGenerate={generateQuiz} results={quizResults} /> : null}
      {tab === 'Chat' ? <Chat room={room} setRoom={setRoom} messages={messages} setMessages={setMessages} /> : null}
      {tab === 'Presentations' ? <Presentations presentations={presentations} setPresentations={setPresentations} /> : null}
      {tab === 'Academics' ? (
        <Academics
          grades={grades}
          setGrades={setGrades}
          simulations={simulations}
          setSimulations={setSimulations}
          avg={avg}
          gradesChartData={gradesChartData}
          kpiData={kpiData}
        />
      ) : null}
      {tab === 'AI Tutor' ? <AiTutor tutorMessages={tutorMessages} setTutorMessages={setTutorMessages} /> : null}
    </AppShell>
  );
}

function Tasks({ tasks, setTasks }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Daily Tasks</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option>low</option><option>medium</option><option>high</option>
        </select>
        <button className="btn-primary" onClick={() => { if (!title.trim()) return; setTasks([{ id: Date.now(), title, priority, done: false }, ...tasks]); setTitle(''); }}>Add task</button>
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={t.done} onChange={() => setTasks(tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} />
              <span>{t.title}</span>
              <span className="ml-auto text-xs text-muted">{t.priority}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Quizzes({ config, setConfig, onGenerate, results }) {
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Quiz / Exam Generator</h3>
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <select className="input" value={config.mode} onChange={(e) => setConfig((c) => ({ ...c, mode: e.target.value }))}>
          <option value="quiz">Quiz</option>
          <option value="exam">Exam</option>
          <option value="test">Test</option>
        </select>
        <select className="input" value={config.difficulty} onChange={(e) => setConfig((c) => ({ ...c, difficulty: e.target.value }))}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <input className="input" type="number" value={config.count} onChange={(e) => setConfig((c) => ({ ...c, count: e.target.value }))} />
        <button className="btn-primary" onClick={onGenerate}>Generate</button>
      </div>
      <div className="mb-3 inline-flex items-center rounded-full border border-border bg-slate-50 px-3 py-1 text-xs">Timer chip: 02:00</div>
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <strong>{r.topic}</strong> ({r.difficulty}) - {r.correct}/{r.total}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chat({ room, setRoom, messages, setMessages }) {
  const [text, setText] = useState('');
  const rooms = ['global', 'private', 'class-group'];
  const roomMessages = messages.filter((m) => m.room === room);
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Class Collaboration Chat</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input" value={room} onChange={(e) => setRoom(e.target.value)}>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type message..." />
        <button className="btn-primary" onClick={() => { if (!text.trim()) return; setMessages((p) => [...p, { id: Date.now(), room, text, sender: 'You' }]); setText(''); }}>Send</button>
      </div>
      <ul className="space-y-2">{roomMessages.map((m) => <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"><b>{m.sender}:</b> {m.text}</li>)}</ul>
    </section>
  );
}

function Presentations({ presentations, setPresentations }) {
  const [topic, setTopic] = useState('My Project');
  const [guide, setGuide] = useState('10 slides, include references');
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Presentation Builder</h3>
      <div className="mb-3 flex flex-col gap-2">
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <textarea className="input min-h-24" value={guide} onChange={(e) => setGuide(e.target.value)} />
        <button className="btn-primary w-fit" onClick={() => setPresentations([{ id: Date.now(), title: topic, slides: ['Intro', 'Method', 'Results', 'Conclusion'], notes: guide }, ...presentations])}>Generate outline</button>
      </div>
      <ul className="space-y-2">{presentations.map((p) => <li key={p.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">{p.title} ({p.slides.length} slides)</li>)}</ul>
    </section>
  );
}

function Academics({ grades, setGrades, simulations, setSimulations, avg, gradesChartData, kpiData }) {
  const [subject, setSubject] = useState('Math');
  const [score, setScore] = useState(85);
  const [weight, setWeight] = useState(0.4);
  const [target, setTarget] = useState(90);
  const [finalWeight, setFinalWeight] = useState(0.5);
  const add = () => setGrades([{ id: Date.now(), subject, score: Number(score), weight: Number(weight) }, ...grades]);
  const simulate = () => {
    const req = finalWeight <= 0 ? 0 : Math.max(0, Math.min(100, (target - avg * (1 - finalWeight)) / finalWeight));
    setSimulations([{ id: Date.now(), req, target }, ...simulations]);
  };
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Academic Progress</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Average</p><p className="text-xl font-semibold">{avg.toFixed(1)}</p></div>
        <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Target</p><p className="text-xl font-semibold">{target}</p></div>
        <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Required Final</p><p className="text-xl font-semibold">{simulations[0]?.req?.toFixed(1) || '0.0'}</p></div>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-3"><Line data={gradesChartData} /></div>
        <div className="rounded-xl border border-border bg-white p-3"><Doughnut data={kpiData} /></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="input" type="number" value={score} onChange={(e) => setScore(e.target.value)} />
        <input className="input" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <button className="btn-primary" onClick={add}>Add grade</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input" type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        <input className="input" type="number" step="0.1" value={finalWeight} onChange={(e) => setFinalWeight(Number(e.target.value))} />
        <button className="btn-ghost" onClick={simulate}>Simulate final</button>
      </div>
      <ul className="space-y-2">{simulations.map((s) => <li key={s.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">Need {s.req.toFixed(1)} to reach {s.target}</li>)}</ul>
    </section>
  );
}

function AiTutor({ tutorMessages, setTutorMessages }) {
  const [prompt, setPrompt] = useState('');
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">AI Tutor</h3>
      <textarea className="input min-h-24" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask study guidance..." />
      <button className="btn-primary mt-2" onClick={() => { if (!prompt.trim()) return; setTutorMessages((prev) => [...prev, { id: Date.now(), you: prompt, tutor: 'Break work into 25-minute focused blocks and review weak topics first.' }]); setPrompt(''); }}>Ask Tutor</button>
      <ul className="mt-3 space-y-2">{tutorMessages.map((m) => <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"><b>You:</b> {m.you}<br /><b>Tutor:</b> {m.tutor}</li>)}</ul>
    </section>
  );
}
