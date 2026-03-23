import { useMemo, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const tabs = ['Ingest', 'Flashcards', 'Tasks', 'Quizzes', 'Chat', 'Presentations', 'Academics', 'AI Tutor'];
const roomIds = ['global', 'private', 'class-group'];

const stopwords = new Set([
  'about', 'above', 'after', 'again', 'against', 'among', 'because', 'before', 'being', 'below', 'between',
  'could', 'every', 'first', 'from', 'have', 'into', 'itself', 'might', 'other', 'should', 'since', 'their',
  'there', 'these', 'those', 'through', 'under', 'until', 'using', 'where', 'which', 'while', 'would',
  'class', 'method', 'function', 'array', 'index', 'errors', 'using',
]);

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

function isLikelyCompleteSentence(sentence) {
  const s = sentence.trim();
  if (s.length < 45 || s.length > 260) return false;
  if (!/[.!?]$/.test(s)) return false;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  const symbols = (s.match(/[{}[\]<>/\\=_]/g) || []).length;
  if (letters < 30) return false;
  if (symbols > letters * 0.08) return false;
  if (digits > letters * 0.5) return false;
  return true;
}

function bestKeyword(sentence) {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !stopwords.has(w));
  return words[0] || null;
}

function firstNonStopword(sentence) {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .find((w) => w.length >= 4 && !stopwords.has(w)) || null;
}

function extractTopics(sentences) {
  const freq = new Map();
  for (const s of sentences) {
    const seen = new Set();
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !stopwords.has(w))
      .forEach((w) => {
        if (seen.has(w)) return;
        seen.add(w);
        freq.set(w, (freq.get(w) || 0) + 1);
      });
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

function buildQuestion(sentence, index, topics) {
  const t = topics[index % Math.max(topics.length, 1)] || bestKeyword(sentence) || 'topic';
  const term = firstNonStopword(sentence) || t;
  const templates = [
    `Define "${term}" in the context of this material.`,
    `Why is "${t}" important according to the text?`,
    `How does the text explain "${t}"?`,
    `What problem does "${t}" help solve in this topic?`,
    `Give one practical example related to "${term}" from this content.`,
    `What is the key takeaway of this statement about "${t}"?`,
    `Which concept in this sentence is most related to "${term}"?`,
    `Fill in the idea: "${sentence.slice(0, 80)}..." refers mainly to what concept?`,
  ];
  return templates[index % templates.length];
}

function cardsFromText(raw) {
  const cleaned = cleanAcademicText(raw);
  const completeSentences = cleaned.match(/[^.!?]+[.!?]/g) || [];
  const parts = completeSentences
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => isLikelyCompleteSentence(x) && !looksLikeGibberish(x))
    .slice(0, 40);

  const unique = [];
  const seen = new Set();
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= 16) break;
  }

  const topics = extractTopics(unique);
  return unique.map((text, i) => {
    const question = buildQuestion(text, i, topics);
    return {
      id: `${Date.now()}-${i}`,
      question,
      answer: text,
      right: 0,
      wrong: 0,
    };
  });
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

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  let allText = '';
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const content = await p.getTextContent();
    let pageText = '';
    let lastY = null;
    for (const item of content.items) {
      const str = item.str || '';
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
        pageText += '\n';
      } else if (pageText && !pageText.endsWith('\n')) {
        pageText += ' ';
      }
      pageText += str;
      lastY = y;
    }
    allText += `${pageText}\n`;
  }
  return allText;
}

async function fileToText(file) {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return extractPdfText(file);

  const buffer = await file.arrayBuffer();
  if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    return new TextDecoder().decode(buffer);
  }
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

  const currentCard = cards[0];
  const roomMessages = useMemo(() => messages.filter((m) => m.room === room), [messages, room]);
  const avg = useMemo(() => {
    const w = grades.reduce((s, g) => s + g.weight, 0);
    if (!w) return 0;
    return grades.reduce((s, g) => s + g.score * g.weight, 0) / w;
  }, [grades]);

  const generateForChunk = async (chunk) => {
    setIsGenerating(true);
    try {
      const aiCards = await generateCardsWithOllama(chunk.content);
      if (aiCards.length) {
        setCards((prev) => [...aiCards, ...prev]);
        setNotice(`Generated ${aiCards.length} AI flashcards with local model.`);
        return;
      }
      const fallback = cardsFromText(chunk.content);
      if (!fallback.length) {
        setNotice('Could not build good study questions from this file. Try a cleaner text PDF.');
        return;
      }
      setCards((prev) => [...fallback, ...prev]);
      setNotice(`Generated ${fallback.length} fallback flashcards (Ollama returned none).`);
    } catch {
      const fallback = cardsFromText(chunk.content);
      if (!fallback.length) {
        setNotice('Ollama is offline and fallback could not build cards. Start `npm run server` and Ollama.');
        return;
      }
      setCards((prev) => [...fallback, ...prev]);
      setNotice(`Ollama unavailable. Generated ${fallback.length} fallback flashcards.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await fileToText(file);
    const cleaned = cleanAcademicText(text);
    if (!cleaned || looksLikeGibberish(cleaned)) {
      setNotice('Could not extract readable text. Use a text-based PDF or TXT file.');
      return;
    }
    const chunk = { id: `${Date.now()}`, name: file.name, content: cleaned };
    setChunks((prev) => [chunk, ...prev]);
    await generateForChunk(chunk);
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
            <button disabled={!chunks[0] || isGenerating} onClick={() => void generateForChunk(chunks[0])}>
              {isGenerating ? 'Generating...' : 'Generate Flashcards (Latest Upload)'}
            </button>
            <ul>
              {chunks.map((c) => (
                <li key={c.id}>
                  {c.name} <button disabled={isGenerating} onClick={() => void generateForChunk(c)}>{isGenerating ? 'Generating...' : 'Generate'}</button>
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
