import { useEffect, useRef } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';

/**
 * Hold-to-talk mic button.
 * Fires onTranscript(text) for each finalised speech chunk.
 * Fires onListeningEnd() when recognition stops — callers use this to
 * trigger auto-send if desired.
 */
export default function VoiceInputButton({ onTranscript, onListeningEnd, disabled }) {
  const { isSupported, isListening, interimText, error, start, stop } =
    useSpeechRecognition();

  // Detect the transition from listening → stopped and notify the parent.
  // This fires after the final onresult has already updated question state.
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (wasListeningRef.current && !isListening) {
      onListeningEnd?.();
    }
    wasListeningRef.current = isListening;
  }, [isListening, onListeningEnd]);

  if (!isSupported) {
    return (
      <p className="voice-unsupported">
        Voice input not available in this browser — type your question above.
      </p>
    );
  }

  function handlePointerDown(e) {
    e.preventDefault(); // prevent scroll-and-focus conflict on touch
    if (disabled || isListening) return;
    start((text) => onTranscript(text));
  }

  function handlePointerUp() {
    if (isListening) stop();
  }

  const label = isListening
    ? interimText || 'Listening…'
    : 'Hold to Speak';

  return (
    <div className="voice-input-wrap">
      <button
        type="button"
        className={`btn-voice-input${isListening ? ' listening' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
        disabled={disabled}
        aria-label={isListening ? 'Recording — release to stop' : 'Hold to speak'}
      >
        <span className="voice-icon" aria-hidden="true">
          {isListening ? '◼' : '◎'}
        </span>
        <span className="voice-label">{label}</span>
      </button>

      {error && (
        <p className="voice-error">
          Mic error: {error}. Check browser permissions.
        </p>
      )}
    </div>
  );
}
