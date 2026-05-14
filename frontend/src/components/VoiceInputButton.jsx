import { useEffect, useRef } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';

/**
 * Hold-to-talk mic button.
 * Pass large=true for the main-screen hero PTT variant.
 */
export default function VoiceInputButton({ onTranscript, onListeningEnd, disabled, large }) {
  const { isSupported, isListening, interimText, error, start, stop } =
    useSpeechRecognition();

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
        Voice input not available in this browser — type your question.
      </p>
    );
  }

  function handlePointerDown(e) {
    e.preventDefault();
    if (disabled || isListening) return;
    start((text) => onTranscript(text));
  }

  function handlePointerUp() {
    if (isListening) stop();
  }

  const label = isListening
    ? interimText || 'Listening…'
    : 'Hold to Speak';

  if (large) {
    return (
      <div className="ptt-wrap">
        <button
          type="button"
          className={`btn-ptt${isListening ? ' listening' : ''}${disabled ? ' disabled' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
          disabled={disabled}
          aria-label={isListening ? 'Recording — release to stop' : 'Hold to speak to the Oracle'}
          aria-pressed={isListening}
        >
          <span className="ptt-ring" aria-hidden="true" />
          <span className="ptt-icon" aria-hidden="true">{isListening ? '◼' : '◎'}</span>
          <span className="ptt-label">{label}</span>
        </button>

        {error && (
          <p className="voice-error">{error}. Check browser permissions.</p>
        )}
      </div>
    );
  }

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
        <span className="voice-icon" aria-hidden="true">{isListening ? '◼' : '◎'}</span>
        <span className="voice-label">{label}</span>
      </button>

      {error && (
        <p className="voice-error">Mic error: {error}. Check browser permissions.</p>
      )}
    </div>
  );
}
