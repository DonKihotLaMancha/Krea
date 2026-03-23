import { useMemo, useState } from 'react';

const tabs = ['Ingest', 'Flashcards', 'Tasks', 'Quizzes', 'Chat', 'Presentations', 'Academics', 'AI Tutor'];
const roomIds = ['global', 'private', 'class-group'];

function cardsFromText(raw) {
  const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
  const parts = cleaned
    .split(/[.!?\n]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 12)
    .slice(0, 12);
  const source = parts.length ? parts : [cleaned || 'No extractable text found in this file.'];
  return source.map((text, i) => ({
    id: `${Date.now()}-${i}`,
    question: `What does this mean: "${text.slice(0, 30)}"?`,
    answer: text,
    right: 0,
    wrong: 0,
  }));
}

async function fileToText(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder().decode(buffer);
  } catch {
    return '';
  }
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

  const currentCard = cards[0];
  const roomMessages = useMemo(() => messages.filter((m) => m.room === room), [messages, room]);
  const avg = useMemo(() => {
    const w = grades.reduce((s, g) => s + g.weight, 0);
    if (!w) return 0;
    return grades.reduce((s, g) => s + g.score * g.weight, 0) / w;
  }, [grades]);

  const generateForChunk = (chunk) => {
    const next = cardsFromText(chunk.content);
    setCards((prev) => [...next, ...prev]);
    setNotice(`Generated ${next.length} flashcards.`);
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await fileToText(file);
    const chunk = { id: `${Date.now()}`, name: file.name, content: text };
    setChunks((prev) => [chunk, ...prev]);
    generateForChunk(chunk);
  };

  const markCard = (ok) => {
    if (!currentCard) return;
    setCards((prev) => {
      const [head, ...rest] = prev;
      const updated = { ...head, right: head.right + (ok ? 1 : 0), wrong: head.wrong + (!ok ? 1 : 0) };
      return ok ? [...rest, updated] : [updated, ...rest];
    });
    setShowAnswer(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>University Assistant</h2>
        {tabs.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </aside>
      <main className="main">
        {notice && <div className="notice">{notice}</div>}

        {tab === 'Ingest' && (
          <section>
            <h3>Upload PDF/Document</h3>
            <input type="file" onChange={onUpload} />
            <button disabled={!chunks[0]} onClick={() => generateForChunk(chunks[0])}>
              Generate Flashcards (Latest Upload)
            </button>
            <ul>
              {chunks.map((c) => (
                <li key={c.id}>
                  {c.name} <button onClick={() => generateForChunk(c)}>Generate</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'Flashcards' && (
          <section>
            <h3>Flashcards ({cards.length})</h3>
            {!currentCard ? (
              <p>No flashcards yet. Upload content in Ingest.</p>
            ) : (
              <div className="card">
                <strong>{currentCard.question}</strong>
                {showAnswer ? <p>{currentCard.answer}</p> : <button onClick={() => setShowAnswer(true)}>Reveal answer</button>}
                <div className="row">
                  <button onClick={() => markCard(false)}>I got it wrong</button>
                  <button onClick={() => markCard(true)}>I got it right</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'Tasks' && <Tasks tasks={tasks} setTasks={setTasks} />}
        {tab === 'Quizzes' && <Quizzes setQuizResults={setQuizResults} quizResults={quizResults} />}
        {tab === 'Chat' && <Chat room={room} setRoom={setRoom} roomIds={roomIds} roomMessages={roomMessages} setMessages={setMessages} />}
        {tab === 'Presentations' && <Presentations presentations={presentations} setPresentations={setPresentations} />}
        {tab === 'Academics' && <Academics grades={grades} setGrades={setGrades} simulations={simulations} setSimulations={setSimulations} avg={avg} />}
        {tab === 'AI Tutor' && <AiTutor tutorMessages={tutorMessages} setTutorMessages={setTutorMessages} />}
      </main>
    </div>
  );
}

function Tasks({ tasks, setTasks }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const done = tasks.filter((t) => t.done).length;
  return (
    <section>
      <h3>Daily Tasks ({done}/{tasks.length})</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option>low</option><option>medium</option><option>high</option>
      </select>
      <button onClick={() => { if (!title.trim()) return; setTasks([{ id: Date.now(), title, priority, done: false }, ...tasks]); setTitle(''); }}>Add</button>
      <ul>{tasks.map((t) => <li key={t.id}><label><input type="checkbox" checked={t.done} onChange={() => setTasks(tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} /> {t.title} ({t.priority})</label></li>)}</ul>
    </section>
  );
}

function Quizzes({ quizResults, setQuizResults }) {
  const [topic, setTopic] = useState('Math');
  const [count, setCount] = useState(20);
  const submit = () => setQuizResults([{ id: Date.now(), topic, total: Number(count), correct: Math.round(Number(count) * 0.75), sec: 120 }, ...quizResults]);
  return <section><h3>Practice Quizzes</h3><input value={topic} onChange={(e) => setTopic(e.target.value)} /><input type="number" value={count} onChange={(e) => setCount(e.target.value)} /><button onClick={submit}>Generate Result</button><ul>{quizResults.map((r) => <li key={r.id}>{r.topic}: {r.correct}/{r.total}</li>)}</ul></section>;
}

function Chat({ room, setRoom, roomIds, roomMessages, setMessages }) {
  const [text, setText] = useState('');
  return (
    <section>
      <h3>Chat</h3>
      <select value={room} onChange={(e) => setRoom(e.target.value)}>{roomIds.map((r) => <option key={r}>{r}</option>)}</select>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" />
      <button onClick={() => { if (!text.trim()) return; setMessages((p) => [...p, { id: Date.now(), room, text, sender: 'You' }]); setText(''); }}>Send</button>
      <ul>{roomMessages.map((m) => <li key={m.id}><b>{m.sender}:</b> {m.text}</li>)}</ul>
    </section>
  );
}

function Presentations({ presentations, setPresentations }) {
  const [topic, setTopic] = useState('My Project');
  const [guide, setGuide] = useState('10 slides, with references');
  return <section><h3>Auto Presentation Builder</h3><input value={topic} onChange={(e) => setTopic(e.target.value)} /><textarea value={guide} onChange={(e) => setGuide(e.target.value)} /><button onClick={() => setPresentations([{ id: Date.now(), title: topic, slides: ['Intro', 'Method', 'Results', 'Conclusion'], notes: guide }, ...presentations])}>Generate Outline</button><ul>{presentations.map((p) => <li key={p.id}>{p.title} ({p.slides.length} slides)</li>)}</ul></section>;
}

function Academics({ grades, setGrades, simulations, setSimulations, avg }) {
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
    <section>
      <h3>Academic Tracking</h3>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      <input type="number" value={score} onChange={(e) => setScore(e.target.value)} />
      <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <button onClick={add}>Add Grade</button>
      <p>Weighted average: {avg.toFixed(2)}</p>
      <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
      <input type="number" step="0.1" value={finalWeight} onChange={(e) => setFinalWeight(Number(e.target.value))} />
      <button onClick={simulate}>Simulate Final</button>
      <ul>{simulations.map((s) => <li key={s.id}>Need {s.req.toFixed(1)} to reach {s.target}</li>)}</ul>
    </section>
  );
}

function AiTutor({ tutorMessages, setTutorMessages }) {
  const [prompt, setPrompt] = useState('');
  const ask = () => {
    if (!prompt.trim()) return;
    const response = 'Break your study into 25-minute sessions, focus on weak topics first, then do active recall.';
    setTutorMessages((prev) => [...prev, { id: Date.now(), you: prompt, tutor: response }]);
    setPrompt('');
  };
  return (
    <section>
      <h3>AI Tutor</h3>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask study guidance..." />
      <button onClick={ask}>Ask Tutor</button>
      <ul>
        {tutorMessages.map((m) => (
          <li key={m.id}>
            <b>You:</b> {m.you}
            <br />
            <b>Tutor:</b> {m.tutor}
          </li>
        ))}
      </ul>
    </section>
  );
}
