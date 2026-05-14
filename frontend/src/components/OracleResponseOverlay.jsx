import { useEffect, useState } from "react";

const COOLDOWN_SEC = 60;

/**
 * Reusable Oracle response overlay.
 * Works as DM consultation view now, and can be reused as a player-facing
 * display by passing the same props from a different screen.
 *
 * Props:
 *   phase       'thinking' | 'cooling'
 *   response    string — the Oracle's response text
 *   toneMode    'oracle' | 'dm'
 *   isSpeaking  bool — keeps overlay alive until speech finishes
 *   onSpeak     () => void
 *   onStopSpeech() => void
 *   onDismiss   () => void — called when cooldown + speech both complete,
 *                            or immediately when the user clicks close
 */
export default function OracleResponseOverlay({
  phase,
  response,
  isSpeaking,
  onSpeak,
  onStopSpeech,
  onDismiss,
}) {
  const [countdown, setCountdown] = useState(COOLDOWN_SEC);
  const [timerDone, setTimerDone] = useState(false);

  // Run the countdown when cooling phase starts.
  useEffect(() => {
    if (phase !== "cooling") {
      setTimerDone(false);
      setCountdown(COOLDOWN_SEC);
      return;
    }

    setTimerDone(false);
    setCountdown(COOLDOWN_SEC);
    const start = Date.now();

    const timer = setInterval(() => {
      const remaining = COOLDOWN_SEC - Math.floor((Date.now() - start) / 1000);
      if (remaining <= 0) {
        clearInterval(timer);
        setCountdown(0);
        setTimerDone(true);
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Auto-dismiss only when the timer has run AND speech has finished.
  useEffect(() => {
    if (timerDone && !isSpeaking) {
      onDismiss?.();
    }
  }, [timerDone, isSpeaking, onDismiss]);

  return (
    <div
      className="oracle-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      data-phase={phase}
    >
      {/* Layered fog — horizontal bands at different depths */}
      <div className="fog-scene" aria-hidden="true">
        {/* Far depth: slowest, widest, most diffuse */}
        <div className="fog-band fog-far" />
        {/* Mid depth A: drifts left */}
        <div className="fog-band fog-mid-a" />
        {/* Mid depth B: drifts right, crossing mid-a */}
        <div className="fog-band fog-mid-b" />
        {/* Near depth: slightly faster, thinner */}
        <div className="fog-band fog-near" />
        {/* High wisp: catches the upper air current */}
        <div className="fog-band fog-wisp" />

        {/* Upper atmosphere — thin broken strands above the centre mass */}
        <div className="fog-band fog-upper-a" />
        <div className="fog-band fog-upper-b" />
        <div className="fog-band fog-upper-c" />

        {/* Lower atmosphere — wisps descending toward the floor pool */}
        <div className="fog-band fog-lower-a" />
        <div className="fog-band fog-lower-b" />
        <div className="fog-band fog-lower-c" />

        {/* Floor accumulation */}
        <div className="fog-floor" />
        {/* Vignette keeps edges dark and text readable */}
        <div className="fog-vignette" />
      </div>

      {/* Dismiss button — fades in after a short delay */}
      <button
        type="button"
        className="oracle-overlay__close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        Dismiss
      </button>

      <div className="oracle-overlay__content">
        <span className="oracle-overlay__sigil" aria-hidden="true">◈</span>

        {phase === "thinking" && (
          <p className="oracle-overlay__status">The Oracle is thinking…</p>
        )}

        {phase === "cooling" && response && (
          <>
            <blockquote className="oracle-overlay__text">{response}</blockquote>

            {onSpeak && (
              <div className="oracle-overlay__actions">
                <button
                  type="button"
                  className={`btn-overlay-speak${isSpeaking ? " speaking" : ""}`}
                  onClick={isSpeaking ? onStopSpeech : onSpeak}
                  aria-label={isSpeaking ? "Stop speaking" : "Speak response"}
                >
                  {isSpeaking ? "◼ Stop" : "▶ Speak"}
                </button>
              </div>
            )}

            <p className="oracle-overlay__cooldown" aria-live="polite">
              {isSpeaking && !timerDone
                ? `The Oracle speaks — ${countdown}s`
                : timerDone && isSpeaking
                ? "Waiting for the Oracle to finish…"
                : `The veil is settling · ${countdown}s`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
