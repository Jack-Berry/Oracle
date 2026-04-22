import { useState, useRef, useEffect, useCallback } from 'react';
import VoiceInputButton from './VoiceInputButton.jsx';

const MAX = 1000;
const AUTO_SEND_KEY = 'oracle_auto_send';

function loadAutoSend() {
  try { return JSON.parse(localStorage.getItem(AUTO_SEND_KEY) || 'false'); }
  catch { return false; }
}

export default function ConsultationForm({ onSubmit, isLoading }) {
  const [question, setQuestion] = useState('');
  const [autoSend, setAutoSend] = useState(loadAutoSend);

  // Keep a ref in sync so handleListeningEnd can read the latest question
  // value without capturing a stale closure.
  const questionRef = useRef(question);
  useEffect(() => { questionRef.current = question; }, [question]);

  const isLoadingRef = useRef(isLoading);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || isLoading) return;
    onSubmit(q);
    setQuestion('');
  }

  // Append each finalised speech chunk to whatever the user has typed
  function handleTranscript(text) {
    setQuestion(prev => {
      const base = prev.trimEnd();
      return base ? base + ' ' + text.trim() : text.trim();
    });
  }

  // Called by VoiceInputButton when recognition ends (pointer released + final
  // results flushed). If auto-send is on, submit immediately.
  const handleListeningEnd = useCallback(() => {
    if (!autoSend) return;
    if (isLoadingRef.current) return;
    // Small defer so React has committed the last transcript chunk to state
    setTimeout(() => {
      const q = questionRef.current.trim();
      if (!q || isLoadingRef.current) return;
      onSubmit(q);
      setQuestion('');
    }, 100);
  }, [autoSend, onSubmit]);

  function handleAutoSendChange(e) {
    const val = e.target.checked;
    setAutoSend(val);
    try { localStorage.setItem(AUTO_SEND_KEY, JSON.stringify(val)); } catch {}
  }

  return (
    <form className="consult-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="oracle-question">Your Question</label>
        <textarea
          id="oracle-question"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Can the rogue attempt to climb the slick obsidian wall silently?"
          rows={4}
          maxLength={MAX}
          disabled={isLoading}
          aria-describedby="char-count"
        />
        <div id="char-count" className="char-count" aria-live="polite">
          {question.length} / {MAX}
        </div>
      </div>

      <VoiceInputButton
        onTranscript={handleTranscript}
        onListeningEnd={handleListeningEnd}
        disabled={isLoading}
      />

      <label className="auto-send-row">
        <input
          type="checkbox"
          checked={autoSend}
          onChange={handleAutoSendChange}
        />
        <span>Auto-send spoken question</span>
      </label>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={isLoading || !question.trim()}
      >
        {isLoading ? 'Consulting…' : 'Ask the Oracle'}
      </button>
    </form>
  );
}
