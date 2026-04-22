export default function StatusBanner({ type, message, onDismiss }) {
  if (!message) return null;

  return (
    <div className={`status-banner ${type}`} role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="status-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
