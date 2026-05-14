import { useState } from 'react';

const MAX_TITLE = 100;
const MAX_TRIGGER = 300;
const MAX_CONTENT = 2000;

const EMPTY_FORM = {
  title: '',
  triggerPhrase: '',
  mode: 'scripted',
  content: '',
  isEnabled: true,
};

const MODE_OPTIONS = [
  { value: 'scripted', label: 'Exact Script' },
  { value: 'creative', label: 'Creative Prompt' },
];

function modeHelperText(mode) {
  if (mode === 'creative') {
    return 'Creative Prompt asks the Oracle to generate a response from the instruction.';
  }
  return 'Exact Script reads the content directly.';
}

function InvocationForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [submitError, setSubmitError] = useState(null);

  function set(field, val) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.triggerPhrase.trim()) {
      setSubmitError('Trigger phrase is required.');
      return;
    }
    if (!form.content.trim()) {
      setSubmitError('Content is required.');
      return;
    }
    try {
      await onSave({
        title: form.title.trim(),
        triggerPhrase: form.triggerPhrase.trim(),
        mode: form.mode,
        content: form.content,
        isEnabled: !!form.isEnabled,
      });
    } catch (err) {
      setSubmitError(err.message || 'Failed to save invocation.');
    }
  }

  return (
    <form className="party-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>Title</label>
        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          maxLength={MAX_TITLE}
          placeholder="optional, for your own reference"
        />
      </div>

      <div className="field">
        <label>Trigger Phrase *</label>
        <input
          value={form.triggerPhrase}
          onChange={e => set('triggerPhrase', e.target.value)}
          maxLength={MAX_TRIGGER}
          placeholder="Oracle, what wisdom do you have to offer the travellers?"
          required
        />
        <div className="context-char-count">{form.triggerPhrase.length}/{MAX_TRIGGER}</div>
      </div>

      <div className="field">
        <label>Mode</label>
        <div
          role="radiogroup"
          aria-label="Invocation mode"
          className="quirk-style-segmented"
          style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}
        >
          {MODE_OPTIONS.map(opt => {
            const selected = form.mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`btn btn-sm ${selected ? '' : 'btn-ghost'}`}
                onClick={() => set('mode', opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="context-hint" style={{ marginTop: '0.5rem' }}>{modeHelperText(form.mode)}</p>
      </div>

      <div className="field">
        <label>{form.mode === 'creative' ? 'Instruction' : 'Response'}</label>
        <textarea
          value={form.content}
          onChange={e => set('content', e.target.value)}
          rows={4}
          maxLength={MAX_CONTENT}
          placeholder={
            form.mode === 'creative'
              ? 'Create a short riddle implying the answer is fire.'
              : 'The moon has teeth, yet never bites.'
          }
          required
        />
        <div className="context-char-count">{form.content.length}/{MAX_CONTENT}</div>
      </div>

      <label className="drawer-toggle-row">
        <span>Enabled</span>
        <input
          type="checkbox"
          checked={!!form.isEnabled}
          onChange={e => set('isEnabled', e.target.checked)}
        />
      </label>

      {submitError && <p className="party-file-error">{submitError}</p>}

      <div className="party-form-actions">
        <button type="submit" className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function InvocationCard({ invocation, onEdit, onDelete, onToggleEnabled }) {
  const modeLabel = invocation.mode === 'creative' ? 'Creative Prompt' : 'Exact Script';

  function handleDelete() {
    const label = invocation.title || invocation.triggerPhrase.slice(0, 40);
    if (window.confirm(`Delete invocation "${label}"?`)) {
      onDelete(invocation.id);
    }
  }

  return (
    <div className="party-card">
      <div className="party-card-header" style={{ cursor: 'default' }}>
        <div className="party-card-identity">
          <span className="party-char-name">
            {invocation.title || invocation.triggerPhrase.slice(0, 60)}
          </span>
          <span className="party-class-badge">{modeLabel}</span>
          {!invocation.isEnabled && (
            <span className="party-class-badge" style={{ opacity: 0.6 }}>Disabled</span>
          )}
        </div>
        <div className="party-card-btns" onClick={e => e.stopPropagation()}>
          <label
            className="drawer-toggle-row"
            style={{ margin: 0, padding: 0, gap: '0.25rem' }}
            title={invocation.isEnabled ? 'Disable' : 'Enable'}
          >
            <input
              type="checkbox"
              checked={!!invocation.isEnabled}
              onChange={e => onToggleEnabled(invocation.id, e.target.checked)}
              aria-label={`Enable ${invocation.title || 'invocation'}`}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onEdit(invocation)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="party-card-body">
        <p className="party-detail">
          <span className="party-detail-label">Trigger</span> {invocation.triggerPhrase}
        </p>
        <p className="party-detail party-notes">{invocation.content}</p>
      </div>
    </div>
  );
}

export default function ScriptedInvocationsPanel({
  invocations,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);

  async function handleCreate(fields) {
    await onCreate(fields);
    setMode('list');
  }

  async function handleUpdate(fields) {
    await onUpdate(editTarget.id, fields);
    setEditTarget(null);
    setMode('list');
  }

  function startEdit(inv) {
    setEditTarget(inv);
    setMode('edit');
  }

  function cancel() {
    setEditTarget(null);
    setMode('list');
  }

  function toggleEnabled(id, isEnabled) {
    onUpdate(id, { isEnabled }).catch(() => {});
  }

  return (
    <div className="context-panel">
      <button
        type="button"
        className="context-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>Scripted Invocations <span className="context-scope-pill">DM only</span></span>
        <span className={`chevron${open ? ' open' : ''}`} aria-hidden="true">▼</span>
      </button>

      {open && (
        <div className="context-body">
          <p className="context-hint">
            Predefined trigger phrases the Oracle reacts to. When you say or type a matching
            phrase, the Oracle responds with your script (or a creative prompt) instead of the
            normal answer. Punctuation and case do not need to match exactly.
          </p>

          <div className="party-manager-header">
            <span className="drawer-section-label">Invocations</span>
            {mode === 'list' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setMode('add')}
              >
                + Add
              </button>
            )}
          </div>

          {mode === 'add' && (
            <InvocationForm onSave={handleCreate} onCancel={cancel} />
          )}

          {mode === 'edit' && editTarget && (
            <InvocationForm
              initial={{
                title: editTarget.title || '',
                triggerPhrase: editTarget.triggerPhrase,
                mode: editTarget.mode,
                content: editTarget.content,
                isEnabled: !!editTarget.isEnabled,
              }}
              onSave={handleUpdate}
              onCancel={cancel}
            />
          )}

          {mode === 'list' && (
            <div className="party-list">
              {invocations.length === 0 ? (
                <p className="party-empty">
                  No scripted invocations yet. Add one to give the Oracle a fixed reply for a
                  specific phrase.
                </p>
              ) : (
                invocations.map(inv => (
                  <InvocationCard
                    key={inv.id}
                    invocation={inv}
                    onEdit={startEdit}
                    onDelete={onDelete}
                    onToggleEnabled={toggleEnabled}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
