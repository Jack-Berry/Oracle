import { useState, useRef, useEffect, useCallback } from 'react';
import VoiceInputButton from './VoiceInputButton.jsx';

const MAX = 1000;

/**
 * Primary consultation input area.
 * autoSend comes from the parent (stored in OracleScreen) so the
 * SettingsDrawer can toggle it without going through this component.
 */
export default function ConsultationForm({ onSubmit, isLoading, autoSend, locked }) {
  const [question, setQuestion] = useState('');

  const questionRef = useRef(question);
  useEffect(() => { questionRef.current = question; }, [question]);

  const isLoadingRef = useRef(isLoading);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const isDisabled = isLoading || locked;

  function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || isDisabled) return;
    onSubmit(q);
    setQuestion('');
  }

  function handleTranscript(text) {
    setQuestion(prev => {
      const base = prev.trimEnd();
      return base ? base + ' ' + text.trim() : text.trim();
    });
  }

  const handleListeningEnd = useCallback(() => {
    if (!autoSend) return;
    if (isLoadingRef.current) return;
    setTimeout(() => {
      const q = questionRef.current.trim();
      if (!q || isLoadingRef.current) return;
      onSubmit(q);
      setQuestion('');
    }, 100);
  }, [autoSend, onSubmit]);

  return (
    <div className="consult-area">
      <VoiceInputButton
        onTranscript={handleTranscript}
        onListeningEnd={handleListeningEnd}
        disabled={isDisabled}
        large
      />

      {!autoSend && (
        <form className="consult-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="oracle-question">Your Question</label>
            <textarea
              id="oracle-question"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="What fate awaits…"
              rows={3}
              maxLength={MAX}
              disabled={isDisabled}
              aria-describedby="char-count"
            />
            <div id="char-count" className="char-count" aria-live="polite">
              {question.length} / {MAX}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isDisabled || !question.trim()}
          >
            {isLoading ? 'Consulting…' : 'Ask the Oracle'}
          </button>
        </form>
      )}

      {autoSend && question && (
        <p className="consult-transcript">{question}</p>
      )}
    </div>
  );
}
