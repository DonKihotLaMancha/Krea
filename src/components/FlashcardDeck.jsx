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
          <p className="mb-2 text-xs text-muted">Card 1 of {cards.length}</p>
          <div className="mb-3 h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(8, (1 / cards.length) * 100)}%` }} />
          </div>
          <div className="rounded-xl border border-border bg-slate-50 p-4">
            <p className="font-medium">{currentCard.question}</p>
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
