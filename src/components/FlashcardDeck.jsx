import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SWIPE_GRADE_PX = 72;
const SWIPE_REVEAL_PX = 56;

export default function FlashcardDeck({
  cards,
  sourceLabel = '',
  showAnswer,
  setShowAnswer,
  onRight,
  onWrong,
  sessionRight = 0,
  sessionWrong = 0,
  latestBatchAt,
  onGenerateMore,
  onClear,
  isGenerating = false,
}) {
  const currentCard = cards[0];
  const pointerStart = useRef(null);
  const suppressClickUntil = useRef(0);
  const flashTimer = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [gradeFlash, setGradeFlash] = useState(null);
  const [reviewedIds, setReviewedIds] = useState(() => new Set());
  const [roundComplete, setRoundComplete] = useState(false);
  const deckSize = cards.length;

  const triggerGradeFlash = useCallback((kind) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setGradeFlash(kind);
    flashTimer.current = window.setTimeout(() => {
      setGradeFlash(null);
      flashTimer.current = null;
    }, 520);
  }, []);

  const handleRight = useCallback(() => {
    if (!currentCard || roundComplete) return;
    let completedNow = false;
    setReviewedIds((prev) => {
      const next = new Set(prev);
      next.add(currentCard.id);
      completedNow = next.size >= deckSize;
      return next;
    });
    setRoundComplete(completedNow);
    triggerGradeFlash('right');
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    } catch {
      /* ignore */
    }
    onRight();
    setShowAnswer(false);
  }, [currentCard, deckSize, onRight, roundComplete, setShowAnswer, triggerGradeFlash]);

  const handleWrong = useCallback(() => {
    if (!currentCard || roundComplete) return;
    let completedNow = false;
    setReviewedIds((prev) => {
      const next = new Set(prev);
      next.add(currentCard.id);
      completedNow = next.size >= deckSize;
      return next;
    });
    setRoundComplete(completedNow);
    triggerGradeFlash('wrong');
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([18, 40, 18]);
    } catch {
      /* ignore */
    }
    onWrong();
    setShowAnswer(false);
  }, [currentCard, deckSize, onWrong, roundComplete, setShowAnswer, triggerGradeFlash]);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const deckSignature = useMemo(
    () => cards.map((c) => c.id).slice().sort().join('|'),
    [cards],
  );

  useEffect(() => {
    setReviewedIds(new Set());
    setRoundComplete(false);
  }, [deckSignature]);

  const toggleFlip = useCallback(() => {
    if (roundComplete) return;
    setShowAnswer((v) => !v);
  }, [roundComplete, setShowAnswer]);

  useEffect(() => {
    const onKey = (e) => {
      if (!currentCard || roundComplete) return;
      const t = e.target;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'BUTTON' ||
          t.tagName === 'A' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggleFlip();
        return;
      }
      if (showAnswer) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleWrong();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleRight();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentCard, roundComplete, showAnswer, handleWrong, handleRight, toggleFlip]);

  const onPointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    setDragX(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!pointerStart.current || roundComplete) return;
    setDragX(e.clientX - pointerStart.current.x);
  };

  const endPointer = (e) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    pointerStart.current = null;
    setDragX(0);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    let acted = false;
    if (showAnswer) {
      if (dx > SWIPE_GRADE_PX) {
        handleRight();
        acted = true;
      } else if (dx < -SWIPE_GRADE_PX) {
        handleWrong();
        acted = true;
      }
    } else if (Math.abs(dx) > SWIPE_REVEAL_PX) {
      setShowAnswer(true);
      acted = true;
    }
    // Treat a near-zero drag as a tap so flip works reliably
    // across mouse/touch and doesn't depend on synthetic click firing.
    if (!acted && Math.abs(dx) < 10) {
      toggleFlip();
      acted = true;
    }
    if (acted) suppressClickUntil.current = Date.now() + 320;
  };

  const totalRated = sessionRight + sessionWrong;
  const accuracy = totalRated ? Math.round((sessionRight / totalRated) * 100) : 0;

  const cardShellClass =
    gradeFlash === 'right'
      ? 'shadow-[0_0_0_4px_rgba(16,185,129,0.9)]'
      : gradeFlash === 'wrong'
        ? 'shadow-[0_0_0_4px_rgba(244,63,94,0.9)]'
        : '';

  return (
    <section className="panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Flashcards</h3>
          {sourceLabel ? (
            <p className="mt-0.5 text-sm text-slate-500">{sourceLabel}</p>
          ) : null}
        </div>
        {latestBatchAt ? <span className="text-xs text-muted">Last generated: {latestBatchAt}</span> : null}
      </div>

      {!currentCard ? (
        <p className="mx-auto max-w-2xl rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-muted">
          {sourceLabel ? (
            <>
              No flashcards yet for “{sourceLabel}”. Pick a deck style and click{' '}
              <strong className="text-slate-700">Generate flashcards</strong> above, or use Generate on the Ingest tab.
            </>
          ) : (
            <>No cards yet. Upload material in Ingest and select a PDF, then use Generate flashcards above.</>
          )}
        </p>
      ) : (
        <>
          <div className="mb-4 min-h-[4.75rem] w-full max-w-xl mx-auto flex flex-col items-center justify-center gap-1.5 px-2">
            <p className="text-center text-sm font-medium text-slate-700">
              {deckSize} card{deckSize === 1 ? '' : 's'} in this deck
              <span className="text-slate-400"> · </span>
              <span className="text-emerald-700">Know: {sessionRight}</span>
              <span className="text-slate-400"> · </span>
              <span className="text-rose-700">Review: {sessionWrong}</span>
            </p>
            <p className="text-center text-xs leading-snug text-slate-500">
              <strong className="font-medium text-slate-600">How it works:</strong> Know it moves this card to the back of the deck;
              Still learning keeps it at the front so it comes up again soon. Counts are for this PDF until you switch documents or clear the set.
            </p>
          </div>

          {roundComplete ? (
            <div className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-center text-base font-semibold text-slate-900">Round complete</p>
              <p className="mt-1 text-center text-sm text-slate-700">
                You reviewed {reviewedIds.size} / {deckSize} cards.
              </p>
              <p className="mt-1 text-center text-sm text-slate-700">
                Accuracy: <span className="font-semibold">{accuracy}%</span> ({sessionRight} known, {sessionWrong} review)
              </p>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-800">Performance analysis</p>
                {accuracy >= 85 ? (
                  <p className="mt-1">Strong recall. Keep spacing reviews and add a few harder cards to avoid overconfidence.</p>
                ) : accuracy >= 60 ? (
                  <p className="mt-1">Solid progress. Focus on the cards you marked “Still learning” and explain answers out loud once.</p>
                ) : (
                  <p className="mt-1">Foundation needs reinforcement. Do a shorter second round now and break difficult cards into smaller facts.</p>
                )}
              </div>
              <button
                type="button"
                className="btn-primary mt-3 w-full"
                onClick={() => {
                  setReviewedIds(new Set());
                  setRoundComplete(false);
                  setShowAnswer(false);
                }}
              >
                Start another round
              </button>
            </div>
          ) : (
          <div className="relative mx-auto w-full max-w-xl pb-2">
            {cards.slice(1, 3).map((c, stackIdx) => (
              <div
                key={c.id}
                className="pointer-events-none absolute inset-x-2 top-2 -z-10 rounded-2xl border border-slate-200/80 bg-slate-50 shadow-sm"
                style={{
                  height: 'min(20rem, 52vh)',
                  transform: `translateY(${(stackIdx + 1) * 10}px) scale(${0.94 - stackIdx * 0.02})`,
                  opacity: 0.55 - stackIdx * 0.12,
                }}
                aria-hidden
              />
            ))}

            <motion.div
              key={currentCard.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                x: dragX * 0.25,
                rotate: dragX * 0.035,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="relative z-0"
            >
              <div
                className="mx-auto w-full [perspective:1400px]"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
                style={{ touchAction: 'pan-y' }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if (Date.now() < suppressClickUntil.current) return;
                    e.preventDefault();
                    toggleFlip();
                  }}
                  className={`relative mx-auto cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#4257b2] focus-visible:ring-offset-2 rounded-2xl transition-shadow duration-200 ${cardShellClass}`}
                  aria-label={showAnswer ? 'Flip card to show question' : 'Flip card to show answer'}
                >
                  <div
                    className="relative h-[min(20rem,52vh)] w-full transition-transform duration-500 ease-out [transform-style:preserve-3d]"
                    style={{
                      transform: `rotateY(${showAnswer ? 180 : 0}deg)`,
                    }}
                  >
                    <div
                      className="absolute inset-0 flex flex-col justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-white px-6 py-8 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] [backface-visibility:hidden]"
                    >
                      {currentCard.type === 'cloze' ? (
                        <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-violet-600">
                          Cloze
                        </p>
                      ) : null}
                      <p className="text-center text-lg font-medium leading-relaxed text-slate-900 sm:text-xl">
                        {currentCard.question}
                      </p>
                      <span className="mt-6 text-center text-xs text-slate-400">Click the card to see the answer</span>
                    </div>
                    <div
                      className="absolute inset-0 flex flex-col justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-[#f6f7fb] px-6 py-8 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] [backface-visibility:hidden] [transform:rotateY(180deg)]"
                    >
                      <p className="text-center text-base leading-relaxed text-slate-800 sm:text-lg">
                        {currentCard.answer}
                      </p>
                      <span className="mt-6 text-center text-xs text-slate-400">
                        Swipe ← still learning · Know it → · or use arrow keys
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
          )}

          {!roundComplete ? (
          <div className="mx-auto mt-2 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch">
            <button
              type="button"
              className="order-2 flex-1 rounded-xl border-2 border-rose-600 bg-rose-50 py-3 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 active:scale-[0.98] sm:order-1"
              onClick={handleWrong}
            >
              Still learning
            </button>
            <button
              type="button"
              className="order-1 flex-1 rounded-xl border-2 border-emerald-700 bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] sm:order-2"
              onClick={handleRight}
            >
              Know it
            </button>
          </div>
          ) : null}

          <p className="mx-auto mt-3 max-w-xl text-center text-[11px] text-slate-400">
            Keyboard: Space flip · ← / → rate when the definition is showing
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="btn-ghost text-sm" disabled={isGenerating} onClick={onGenerateMore}>
              {isGenerating ? 'Generating…' : 'Generate more'}
            </button>
            <button type="button" className="btn-ghost text-sm text-slate-600" disabled={isGenerating} onClick={onClear}>
              Clear set
            </button>
          </div>
        </>
      )}
    </section>
  );
}
