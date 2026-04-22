export default function ToneModeToggle({ value, onChange }) {
  return (
    <div className="tone-toggle" role="group" aria-label="Oracle response tone">
      <button
        type="button"
        className={`tone-btn${value === 'oracle' ? ' active' : ''}`}
        onClick={() => onChange('oracle')}
        aria-pressed={value === 'oracle'}
      >
        ◈ Oracle Mode
      </button>
      <button
        type="button"
        className={`tone-btn${value === 'dm' ? ' active' : ''}`}
        onClick={() => onChange('dm')}
        aria-pressed={value === 'dm'}
      >
        ⚑ DM Advice
      </button>
    </div>
  );
}
