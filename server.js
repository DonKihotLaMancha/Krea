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

  const prompt = `
You are a study assistant.
Generate 10 diverse, accurate flashcards from the source text.
Rules:
- Use only information that appears in the source.
- Keep answers concise (1-3 sentences).
- Questions must be varied (definition, how, why, comparison, application).
- If evidence is unclear, skip that card.
- Return JSON only with this exact schema:
{"cards":[{"question":"...","answer":"...","evidence":"exact short quote from source"}]}

SOURCE:
${text.slice(0, 12000)}
`;

  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });

    if (!resp.ok) {
      return res.status(502).json({ error: 'Failed to query Ollama.' });
    }

    const data = await resp.json();
    const raw = String(data.response || '').trim();
    const parsed = JSON.parse(raw);
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

    return res.json({ cards });
  } catch (error) {
    return res.status(500).json({ error: 'Could not generate cards.', details: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
