export default function ConsultationHistory({
  consultations,
  onClear,
  onSpeak,
  onStopSpeech,
  speakingId,
  isSpeaking,
  ttsSupported,
}) {
  if (consultations.length === 0) {
    return (
      <section className="history-section">
        <div className="history-empty">
          No consultations yet — ask the Oracle your first question.
        </div>
      </section>
    );
  }

  return (
    <section className="history-section" aria-label="Consultation history">
      <div className="history-header">
        <span className="history-label">Session Consultations</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-danger"
          onClick={onClear}
        >
          Clear History
        </button>
      </div>

      <div className="history-list">
        {consultations.map((c, i) => (
          <ConsultCard
            key={c.id}
            consultation={c}
            isLatest={i === 0}
            ttsSupported={ttsSupported}
            isSpeakingThis={speakingId === c.id && isSpeaking}
            onSpeak={onSpeak}
            onStopSpeech={onStopSpeech}
          />
        ))}
      </div>
    </section>
  );
}

function ConsultCard({
  consultation,
  isLatest,
  ttsSupported,
  isSpeakingThis,
  onSpeak,
  onStopSpeech,
}) {
  const { id, question, response, timestamp, toneMode } = consultation;
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article
      className="consult-item"
      aria-label={isLatest ? 'Latest consultation' : undefined}
    >
      <div className="consult-meta">
        <span className={`tone-pill ${toneMode}`}>
          {toneMode === 'oracle' ? '◈ Oracle' : '⚑ DM Advice'}
        </span>
        <div className="consult-meta-right">
          <span className="consult-time">{time}</span>
          {ttsSupported && (
            <button
              type="button"
              className={`btn-speak${isSpeakingThis ? ' speaking' : ''}`}
              onClick={() =>
                isSpeakingThis ? onStopSpeech() : onSpeak(id, response)
              }
              aria-label={isSpeakingThis ? 'Stop speaking' : 'Speak response'}
            >
              {isSpeakingThis ? '◼ Stop' : '▶ Speak'}
            </button>
          )}
        </div>
      </div>
      <p className="consult-question">{question}</p>
      <p className="consult-response">{response}</p>
    </article>
  );
}
