import { apiUrl } from './apiBase';

/**
 * Reads Ollama NDJSON stream from POST /api/tutor-chat-stream and accumulates `response` tokens.
 * @param {{ prompt: string, sources: Array<{name:string,content:string}>, onDelta?: (full: string) => void, signal?: AbortSignal }} opts
 * @returns {Promise<string>}
 */
export async function streamTutorChat({ prompt, sources, onDelta, signal }) {
  const resp = await fetch(apiUrl('/api/tutor-chat-stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sources }),
    signal,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(t || 'Tutor stream failed');
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const j = JSON.parse(trimmed);
        if (j.response) {
          full += j.response;
          onDelta?.(full);
        }
      } catch {
        /* ignore partial JSON line */
      }
    }
  }
  if (buffer.trim()) {
    try {
      const j = JSON.parse(buffer.trim());
      if (j.response) {
        full += j.response;
        onDelta?.(full);
      }
    } catch {
      /* ignore */
    }
  }
  return full.trim();
}
