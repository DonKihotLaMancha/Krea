import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!resp.ok) throw new Error('Ollama unavailable');
    return res.json({ ok: true, model: OLLAMA_MODEL });
  } catch {
    return res.status(503).json({ ok: false, error: 'Ollama is not running.' });
  }
});

app.post('/api/flashcards', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Missing text.' });
  }

  const sourceJson = buildSourceJson(text);
  const prompt = `
You are a study assistant.
Input is structured JSON extracted from a university document.
Generate 10 accurate and varied flashcards using ONLY input data.

Rules:
- Use only SOURCE_JSON facts/sentences.
- Questions must be diverse: definition, why, how, comparison, application.
- Answers concise (1-3 sentences).
- evidence must copy exact short phrase from SOURCE_JSON.sentences or SOURCE_JSON.facts.
- Return valid JSON only:
{"cards":[{"question":"...","answer":"...","evidence":"..."}]}

SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;

  try {
    let cards = await generateCardsWithOllama(prompt);
    if (!cards.length) {
      // Recovery prompt: guarantee cards from explicit facts list.
      const fallbackPrompt = `
Return 8 flashcards from SOURCE_JSON.facts only.
Output strict JSON: {"cards":[{"question":"...","answer":"...","evidence":"..."}]}
SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;
      cards = await generateCardsWithOllama(fallbackPrompt);
    }

    return res.json({ cards });
  } catch (error) {
    return res.status(500).json({ error: 'Could not generate cards.', details: String(error) });
  }
});

async function generateCardsWithOllama(prompt) {
  const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
    }),
  });

  if (!resp.ok) throw new Error('Failed to query Ollama.');
  const data = await resp.json();
  const raw = String(data.response || '').trim();
  const parsed = safeParseModelJson(raw);
  const cards = Array.isArray(parsed.cards)
    ? parsed.cards
        .filter((c) => c?.question && c?.answer)
        .slice(0, 12)
        .map((c, i) => ({
          id: `${Date.now()}-${i}`,
          question: String(c.question).trim(),
          answer: String(c.answer).trim(),
          evidence: String(c.evidence || '').trim(),
          right: 0,
          wrong: 0,
        }))
    : [];
  return cards;
}

function buildSourceJson(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 18000);
  const sentences = (cleaned.match(/[^.!?]+[.!?]/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 260)
    .slice(0, 60);

  const stop = new Set([
    'about','after','again','being','between','could','every','first','from','have','into','other','since',
    'their','there','these','those','through','until','using','which','while','would','where','with','this',
  ]);
  const freq = new Map();
  for (const s of sentences) {
    const uniq = new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !stop.has(w)),
    );
    for (const w of uniq) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topics = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
  const facts = sentences.slice(0, 20);

  return {
    topics,
    facts,
    sentences: sentences.slice(0, 30),
  };
}

function safeParseModelJson(raw) {
  // Accept plain JSON, fenced markdown JSON, or extra pre/post text around JSON.
  const cleanedFence = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleanedFence);
  } catch {
    const first = cleanedFence.indexOf('{');
    const last = cleanedFence.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const sliced = cleanedFence.slice(first, last + 1);
      return JSON.parse(sliced);
    }
    throw new Error('Model output was not valid JSON.');
  }
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
