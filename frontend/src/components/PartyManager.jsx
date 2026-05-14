import { useState, useRef } from 'react';
import { processFile } from '../hooks/useCampaignData.js';
import { DND_KNOWN_LABELS } from '../utils/dndbeyondMapping.js';

const EMPTY_FORM = {
  characterName: '',
  playerName: '',
  class: '',
  race: '',
  level: '',
  notes: '',
};

// ── Shared file status helpers ───────────────────────────────────────────────

function fileStatusLabel(f) {
  if (f.extractedCharacter) {
    const s = f.extractedCharacter.parseStatus;
    if (s === 'success') {
      const name = f.extractedCharacter.basic?.name;
      return name ? `parsed · ${name}` : 'parsed';
    }
    if (s === 'partial') return 'partial parse';
    if (s === 'failed')  return 'parse failed';
  }
  if (f.extractedText) return 'text read';
  if (f.type?.startsWith('image/')) return 'image stored';
  return 'stored';
}

function fileStatusClass(f) {
  if (f.extractedCharacter) {
    const s = f.extractedCharacter.parseStatus;
    if (s === 'success') return 'party-file-status--ok';
    if (s === 'partial') return 'party-file-status--warn';
    if (s === 'failed')  return 'party-file-status--err';
  }
  if (f.extractedText) return 'party-file-status--ok';
  return '';
}

// ── Auto-fill helpers ────────────────────────────────────────────────────────

function extractClassFromLevel(classLevel) {
  if (!classLevel) return '';
  return classLevel.replace(/\s+\d+$/, '').trim();
}

function extractLevelFromClassLevel(classLevel) {
  if (!classLevel) return '';
  const m = classLevel.match(/\b(\d{1,2})$/);
  return m ? m[1] : '';
}

// Returns true only if the value looks like real character data, not a UI label.
function isSafeAutoFill(val) {
  if (!val || typeof val !== 'string') return false;
  const t = val.trim();
  if (t.length < 1 || t.length > 60) return false;
  if (DND_KNOWN_LABELS.has(t.toLowerCase())) return false;
  return true;
}

function isSafeLevel(val) {
  if (!val) return false;
  const n = parseInt(val, 10);
  return !isNaN(n) && n >= 1 && n <= 20;
}

// ── Member add/edit form ─────────────────────────────────────────────────────

function MemberForm({ initial, onSave, onCancel, onAddFile, onRemoveFile }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  // add mode: files queued locally until member is saved and receives a real DB id
  const [pendingFiles, setPendingFiles] = useState([]);
  // edit mode: live file list starting from initial.files, updated on add/remove
  const [editFiles, setEditFiles] = useState(initial?.files || []);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const fileInputRef = useRef();

  const isEdit = !!(initial?.id);

  function set(field, val) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.characterName.trim()) return;
    // pendingFiles is always [] in edit mode (files go through onAddFile immediately)
    onSave({ ...form, characterName: form.characterName.trim() }, pendingFiles);
  }

  function autoFillFromRecord(record) {
    const char = record.extractedCharacter;

    console.group('[PDF autofill]');

    if (!char || !char.basic) {
      console.log('Skipped — no character data');
      if (char) console.log('status:', char.parseStatus, '| reason:', char.reason);
      console.groupEnd();
      return;
    }
    if (char.parseStatus === 'failed') {
      console.log('Skipped — parse failed:', char.reason);
      console.groupEnd();
      return;
    }

    const { name, playerName: pn, classLevel, race } = char.basic;
    const cls = extractClassFromLevel(classLevel);
    const lvl = extractLevelFromClassLevel(classLevel);

    console.log('char.basic:', char.basic);
    console.log('Derived → class:', JSON.stringify(cls), '| level:', JSON.stringify(lvl));
    if (char._normalizedKeys) {
      console.log('Normalized PDF field keys (first 20):', char._normalizedKeys.slice(0, 20));
    }

    // Run safety checks synchronously before calling setForm so the log is
    // immediately visible (React 18 may defer state-updater calls in async contexts).
    const wantToFill = {};
    const cantFill   = {};

    [
      ['characterName', name, isSafeAutoFill],
      ['playerName',    pn,   isSafeAutoFill],
      ['class',         cls,  isSafeAutoFill],
      ['race',          race, isSafeAutoFill],
      ['level',         lvl,  isSafeLevel   ],
    ].forEach(([key, val, check]) => {
      if (check(val)) {
        wantToFill[key] = val;
      } else {
        cantFill[key] = (val != null && val !== '') ? `unsafe: "${val}"` : 'not available';
      }
    });

    console.log('Passed safety checks:', Object.keys(wantToFill).length ? wantToFill : '(none)');
    console.log('Failed safety checks:', Object.keys(cantFill).length   ? cantFill   : '(none)');
    console.groupEnd();

    if (Object.keys(wantToFill).length === 0) return;

    // Apply values that passed checks, skipping any field the user already typed into.
    setForm(prev => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(wantToFill).filter(([key]) => !prev[key])
      ),
    }));
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setFileError(null);
    setFileLoading(true);
    try {
      const record = await processFile(file);
      autoFillFromRecord(record);
      if (isEdit && onAddFile) {
        await onAddFile(initial.id, record);
        setEditFiles(prev => [...prev, record]);
      } else {
        setPendingFiles(prev => [...prev, record]);
      }
    } catch (err) {
      setFileError(err.message);
    } finally {
      setFileLoading(false);
    }
  }

  function removeFile(fileId) {
    if (isEdit && onRemoveFile) {
      onRemoveFile(initial.id, fileId);
      setEditFiles(prev => prev.filter(f => f.id !== fileId));
    } else {
      setPendingFiles(prev => prev.filter(f => f.id !== fileId));
    }
  }

  const displayFiles = isEdit ? editFiles : pendingFiles;

  return (
    <form className="party-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>Character Sheet</label>
        {displayFiles.length > 0 && (
          <ul className="party-files">
            {displayFiles.map(f => (
              <li key={f.id} className="party-file-item">
                <span className="party-file-name" title={f.name}>{f.name}</span>
                <span className={`party-file-status ${fileStatusClass(f)}`}>{fileStatusLabel(f)}</span>
                <button
                  type="button"
                  className="party-file-remove"
                  onClick={() => removeFile(f.id)}
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <p className="party-file-error">{fileError}</p>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={fileLoading}
        >
          {fileLoading ? 'Reading file…' : '+ Attach File'}
        </button>
        <p className="party-file-note">
          Upload a D&amp;D Beyond PDF to auto-fill fields below. .txt / .md also supported. Max 1 MB.
        </p>
      </div>

      <div className="party-form-grid">
        <div className="field">
          <label>Character Name *</label>
          <input
            value={form.characterName}
            onChange={e => set('characterName', e.target.value)}
            required
            maxLength={80}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Player Name</label>
          <input
            value={form.playerName}
            onChange={e => set('playerName', e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="field">
          <label>Class</label>
          <input
            value={form.class}
            onChange={e => set('class', e.target.value)}
            maxLength={80}
            placeholder="Fighter, Wizard…"
          />
        </div>
        <div className="field">
          <label>Race / Species</label>
          <input
            value={form.race}
            onChange={e => set('race', e.target.value)}
            maxLength={80}
            placeholder="Human, Elf…"
          />
        </div>
        <div className="field">
          <label>Level</label>
          <input
            type="number"
            min="1"
            max="20"
            value={form.level}
            onChange={e => set('level', e.target.value)}
            placeholder="1–20"
          />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Backstory, personality, key items, relationships…"
        />
      </div>

      <div className="party-form-actions">
        <button type="submit" className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── File attachments sub-component ──────────────────────────────────────────

function FileAttachments({ memberId, files, onAdd, onRemove }) {
  const inputRef = useRef();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    setLoading(true);
    try {
      const record = await processFile(file);
      await onAdd(memberId, record);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="party-files-section">
      {files.length > 0 && (
        <ul className="party-files">
          {files.map(f => (
            <li key={f.id} className="party-file-item">
              <span className="party-file-name" title={f.name}>{f.name}</span>
              <span className={`party-file-status ${fileStatusClass(f)}`}>{fileStatusLabel(f)}</span>
              <button
                type="button"
                className="party-file-remove"
                onClick={() => onRemove(memberId, f.id)}
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="party-file-error">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? 'Reading file…' : '+ Attach File'}
      </button>
      <p className="party-file-note">
        .pdf (D&amp;D Beyond): character sheet is parsed and shared with the Oracle.
        .txt / .md: full text read. Images: stored only. Max 1 MB per file.
      </p>
    </div>
  );
}

// ── Individual member card ───────────────────────────────────────────────────

function MemberCard({ member, onEdit, onDelete, onAddFile, onRemoveFile }) {
  const [expanded, setExpanded] = useState(false);

  const summary = [member.class, member.race, member.level ? `Lv ${member.level}` : null]
    .filter(Boolean)
    .join(' · ');

  function handleDelete() {
    if (window.confirm(`Remove ${member.characterName} from the party?`)) {
      onDelete(member.id);
    }
  }

  return (
    <div className="party-card">
      <div
        className="party-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className="party-card-identity">
          <span className="party-char-name">{member.characterName}</span>
          {summary && <span className="party-class-badge">{summary}</span>}
        </div>
        <div className="party-card-btns" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onEdit(member)}
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
          <span className={`chevron${expanded ? ' open' : ''}`} aria-hidden="true">▼</span>
        </div>
      </div>

      {expanded && (
        <div className="party-card-body">
          {member.playerName && (
            <p className="party-detail">
              <span className="party-detail-label">Player</span> {member.playerName}
            </p>
          )}
          {member.notes && (
            <p className="party-detail party-notes">{member.notes}</p>
          )}
          <FileAttachments
            memberId={member.id}
            files={member.files || []}
            onAdd={onAddFile}
            onRemove={onRemoveFile}
          />
        </div>
      )}
    </div>
  );
}

// ── Main PartyManager ────────────────────────────────────────────────────────

export default function PartyManager({
  partyMembers,
  onAdd,
  onUpdate,
  onDelete,
  onAddFile,
  onRemoveFile,
}) {
  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [addError, setAddError] = useState(null);

  function startEdit(member) {
    setEditTarget(member);
    setMode('edit');
  }

  async function handleAdd(fields, pendingFiles = []) {
    setAddError(null);
    try {
      const newId = await onAdd(fields);
      // Attach any files queued in the form, now that we have a real member ID
      for (const fileRecord of pendingFiles) {
        try {
          await onAddFile(newId, fileRecord);
        } catch {
          // A file failure doesn't block the member from being created
        }
      }
      setMode('list');
    } catch (err) {
      setAddError(err.message || 'Failed to add member.');
    }
  }

  function handleUpdate(fields) {
    onUpdate(editTarget.id, fields);
    setEditTarget(null);
    setMode('list');
  }

  function cancelEdit() {
    setEditTarget(null);
    setMode('list');
  }

  return (
    <div className="party-manager">
      <div className="party-manager-header">
        <span className="drawer-section-label">Party Members</span>
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
        <>
          <MemberForm onSave={handleAdd} onCancel={() => { setMode('list'); setAddError(null); }} />
          {addError && <p className="party-file-error">{addError}</p>}
        </>
      )}

      {mode === 'edit' && editTarget && (
        <MemberForm
          initial={editTarget}
          onSave={handleUpdate}
          onCancel={cancelEdit}
          onAddFile={onAddFile}
          onRemoveFile={onRemoveFile}
        />
      )}

      {mode === 'list' && (
        <div className="party-list">
          {partyMembers.length === 0 ? (
            <p className="party-empty">
              No party members yet. Add characters so the Oracle knows who is in the party.
            </p>
          ) : (
            partyMembers.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                onEdit={startEdit}
                onDelete={onDelete}
                onAddFile={onAddFile}
                onRemoveFile={onRemoveFile}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
