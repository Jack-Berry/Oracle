export default function MigrationBanner({
  onMigrate,
  onDismiss,
  isMigrating,
  migrationError,
  migrationDone,
}) {
  if (migrationDone) return null;

  return (
    <div className="migration-banner" role="alert">
      <div className="migration-banner-body">
        <strong>Campaign data found in local storage</strong>
        <p>
          Your existing campaign context, party members, hidden context, and consultation history
          can be imported into the database so it persists across devices.
        </p>
        {migrationError && (
          <p className="migration-error">Import failed: {migrationError}</p>
        )}
      </div>
      <div className="migration-banner-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onMigrate}
          disabled={isMigrating}
        >
          {isMigrating ? 'Importing…' : 'Import data'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onDismiss}
          disabled={isMigrating}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
