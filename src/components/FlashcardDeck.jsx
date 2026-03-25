import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

const SWIPE_GRADE_PX = 72;
const SWIPE_REVEAL_PX = 56;

export default function FlashcardDeck({
  cards,
  sourceLabel = '',
  showAnswer,
  setShowAnswer,
  onRight,
  onWrong,
  latestBatchAt,
  onGenerateMore,
  onClear,
}) {
  const currentCard = cards[0];
  const pointerStart = useRef(null);
  const suppressClickUntil = useRef(0);
  const [dragX, setDragX] = useState(0);

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

  const toggleFlip = useCallback(() => {
    setShowAnswer((v) => !v);
  }, [setShowAnswer]);

  useEffect(() => {
    const onKey = (e) => {
      if (!currentCard) return;
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
          onWrong();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onRight();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentCard, showAnswer, onWrong, onRight, toggleFlip]);

  const onPointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    setDragX(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!pointerStart.current) return;
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
        onRight();
        acted = true;
      } else if (dx < -SWIPE_GRADE_PX) {
        onWrong();
        acted = true;
      }
    } else if (Math.abs(dx) > SWIPE_REVEAL_PX) {
      setShowAnswer(true);
      acted = true;
    }
    if (acted) suppressClickUntil.current = Date.now() + 320;
  };

  const deckSize = cards.length;
  const dotCount = Math.min(deckSize, 12);

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
        <p className="text-sm text-muted">
          {sourceLabel
            ? `No flashcards yet for “${sourceLabel}”. Generate from Ingest or another tab for this document.`
            : 'No cards yet. Upload material in Ingest and select a PDF.'}
        </p>
      ) : (
        <>
          {urgent.length ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Due for review</p>
              {maxU <= 0 ? (
                <p className="mt-1 text-xs text-amber-800">Nothing overdue — you&apos;re caught up.</p>
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

          <div className="mb-4 flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-slate-700">
              {deckSize} card{deckSize === 1 ? '' : 's'} in this deck
            </p>
            <div className="flex gap-1.5" role="presentation" aria-hidden>
              {Array.from({ length: dotCount }, (_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${i === 0 ? 'bg-[#4257b2]' : 'bg-slate-200'}`}
                />
              ))}
            </div>
            <p className="text-center text-xs text-slate-500">
              Spaced repetition: cards you know move to the back; ones you miss stay up front.
            </p>
          </div>

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
                  className="relative mx-auto cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#4257b2] focus-visible:ring-offset-2 rounded-2xl"
                  aria-label={showAnswer ? 'Show term (flip card)' : 'Show definition (flip card)'}
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
                      <span className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#4257b2]">
                        Term
                      </span>
                      <p className="text-center text-lg font-medium leading-relaxed text-slate-900 sm:text-xl">
                        {currentCard.question}
                      </p>
                      <span className="mt-6 text-center text-xs text-slate-400">Click or press Space to flip</span>
                    </div>
                    <div
                      className="absolute inset-0 flex flex-col justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-[#f6f7fb] px-6 py-8 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] [backface-visibility:hidden] [transform:rotateY(180deg)]"
                    >
                      <span className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Definition
                      </span>
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

          <div className="mx-auto mt-2 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch">
            <button
              type="button"
              className="btn-ghost order-2 flex-1 border-rose-200 py-3 text-rose-800 hover:bg-rose-50 sm:order-1"
              onClick={onWrong}
            >
              Still learning
            </button>
            <button
              type="button"
              className="order-1 flex-1 rounded-xl border-0 bg-[#2e8b57] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#26734a] sm:order-2"
              onClick={onRight}
            >
              Know it
            </button>
          </div>

          <p className="mx-auto mt-3 max-w-xl text-center text-[11px] text-slate-400">
            Keyboard: Space flip · ← / → rate when the definition is showing
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="btn-ghost text-sm" onClick={onGenerateMore}>
              Generate more
            </button>
            <button type="button" className="btn-ghost text-sm text-slate-600" onClick={onClear}>
              Clear set
            </button>
          </div>
        </>
      )}
    </section>
  );
}
