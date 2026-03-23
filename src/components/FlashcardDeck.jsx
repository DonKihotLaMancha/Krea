import { AnimatePresence, motion } from 'framer-motion';

export default function FlashcardDeck({
  cards,
  showAnswer,
  setShowAnswer,
  onRight,
  onWrong,
  latestBatchAt,
  onGenerateMore,
  onClear,
}) {
  const currentCard = cards[0];
  const scored = cards.map((c) => {
    const due = c.proxima_revision ? new Date(c.proxima_revision) : null;
    const daysLate = due ? Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const wrongWeight = Number(c.veces_mal || c.wrong || 0) * 2;
    const urgency = Math.max(0, daysLate) + wrongWeight;
    return { ...c, urgency };
  });
  const maxU = scored.reduce((m, c) => Math.max(m, c.urgency), 0);
  const seenQ = new Set();
  const urgent = scored
    .sort((a, b) => b.urgency - a.urgency)
    .filter((c) => {
      const key = String(c.question || '').slice(0, 48);
      if (seenQ.has(key)) return false;
      seenQ.add(key);
      return true;
    })
    .slice(0, 3);
  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Flashcards ({cards.length})</h3>
        {latestBatchAt ? <span className="text-xs text-muted">Last generated: {latestBatchAt}</span> : null}
      </div>
      {!currentCard ? (
        <p className="text-sm text-muted">No cards yet. Upload material in Ingest.</p>
      ) : (
        <>
          {urgent.length ? (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Daily Review (SRS urgency)</p>
              {maxU <= 0 ? (
                <p className="mt-1 text-xs text-amber-800">Nothing overdue — you&apos;re caught up. Keep reviewing to stay ahead.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-amber-800">
                  {urgent.map((u) => (
                    <li key={`u-${u.id}`}>
                      {String(u.question).slice(0, 80)}
                      {String(u.question).length > 80 ? '…' : ''}{' '}
                      <span className="font-semibold">Urgency {u.urgency}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <p className="mb-2 text-xs text-muted">Card 1 of {cards.length}</p>
          <div className="mb-3 h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500" style={{ width: `${Math.max(8, (1 / cards.length) * 100)}%` }} />
          </div>
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60 p-4">
            <p className="font-medium leading-relaxed">{currentCard.question}</p>
            <AnimatePresence mode="wait">
              {showAnswer ? (
                <motion.p
                  key="answer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-3 text-sm text-muted"
                >
                  {currentCard.answer}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <div className="mt-3 flex flex-wrap gap-2">
              {!showAnswer ? <button className="btn-ghost" onClick={() => setShowAnswer(true)}>Reveal answer</button> : null}
              <button className="btn-ghost" onClick={onWrong}>I got it wrong</button>
              <button className="btn-primary" onClick={onRight}>I got it right</button>
              <button className="btn-ghost" onClick={onGenerateMore}>Generate more</button>
              <button className="btn-ghost" onClick={onClear}>Clear set</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
