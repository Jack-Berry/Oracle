import { useState } from 'react';
import { extractPdfFormFields, extractPdfAnnotationFields, extractPdfText } from '../utils/pdfExtract.js';
import { mapDndBeyondFields, parseDndBeyondText, buildCharacterSummary } from '../utils/dndbeyondMapping.js';

const STORAGE_KEY = 'oracle_campaign_v1';
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB hard limit

const EMPTY = { campaignContext: '', partyMembers: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function persist(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage quota exceeded — fail silently
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── File processing ──────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PDF_TYPE = 'application/pdf';

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsText(file);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });
}

/**
 * Processes a browser File into a storable record.
 *
 * .txt / .md   → reads text, stores in extractedText
 * .pdf         → extracts D&D Beyond AcroForm fields, stores structured
 *                character data in extractedCharacter and a compact prompt
 *                summary in extractedText
 * images       → stored as dataUrl (display only)
 * other        → metadata only
 */
export async function processFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 1 MB limit.`);
  }

  const base = {
    id: makeId(),
    name: file.name,
    type: file.type || '',
    size: file.size,
    addedAt: new Date().toISOString(),
    extractedText: null,
    extractedCharacter: null,
    dataUrl: null,
  };

  const lower = file.name.toLowerCase();
  const isText  = TEXT_EXTENSIONS.some(ext => lower.endsWith(ext));
  const isImage = IMAGE_TYPES.includes(file.type);
  const isPdf   = file.type === PDF_TYPE || lower.endsWith('.pdf');

  if (isText) {
    const text = await readAsText(file);
    return { ...base, extractedText: text };
  }

  if (isPdf) {
    console.group(`[PDF extract] ${file.name}`);
    try {
      let character;
      let extractionPath;

      // ── Step 1: pdf-lib AcroForm (classic D&D Beyond) ───────────────────────
      console.groupCollapsed('Step 1 — pdf-lib AcroForm');
      const acrRaw   = await extractPdfFormFields(file);
      const acrCount = Object.keys(acrRaw).length;
      console.log(`Fields found: ${acrCount}`);
      if (acrCount > 0) console.log('Field values:', acrRaw);
      console.groupEnd();

      if (acrCount > 0) {
        extractionPath = `pdf-lib AcroForm (${acrCount} fields)`;
        character = mapDndBeyondFields(acrRaw);
      } else {

        // ── Step 2: pdfjs-dist Widget annotations (D&D Beyond 2024+) ────────
        console.groupCollapsed('Step 2 — pdfjs-dist Widget annotations');
        const { raw: annRaw, allWidgets } = await extractPdfAnnotationFields(file);
        const annCount = Object.keys(annRaw).length;
        console.log(`Total Widget annotations: ${allWidgets.length}`);
        console.log(`Widgets with non-empty values: ${annCount}`);
        if (allWidgets.length > 0) console.table(allWidgets.slice(0, 40));
        if (annCount > 0) console.log('Non-empty field values:', annRaw);
        console.groupEnd();

        if (annCount > 0) {
          extractionPath = `pdfjs-dist Widget annotations (${annCount} non-empty fields)`;
          character = mapDndBeyondFields(annRaw);
        } else {

          // ── Step 3: pdfjs-dist text content (last resort) ─────────────────
          console.groupCollapsed('Step 3 — pdfjs-dist text content (label-density guarded)');
          const text  = await extractPdfText(file);
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          console.log(`Total text lines: ${lines.length}`);
          console.log('First 50 lines:', lines.slice(0, 50));
          console.groupEnd();

          extractionPath = 'pdfjs-dist text content (last resort)';
          character = parseDndBeyondText(text);
        }
      }

      console.log('Extraction path:', extractionPath);
      console.log('Mapped character:', character);
      const summary = buildCharacterSummary(character);
      console.log('Summary:', summary || '(empty)');
      console.log('Parse status:', character?.parseStatus);

      return {
        ...base,
        extractedCharacter: character,
        extractedText: summary || null,
      };
    } catch (err) {
      console.error('Extraction error:', err.message, err);
      return {
        ...base,
        extractedCharacter: { parseStatus: 'failed', reason: err.message },
      };
    } finally {
      console.groupEnd();
    }
  }

  if (isImage) {
    const dataUrl = await readAsDataURL(file);
    return { ...base, dataUrl };
  }

  // Unknown type: metadata only
  return base;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCampaignData() {
  const [data, setData] = useState(load);

  function save(next) {
    setData(next);
    persist(next);
  }

  function setCampaignContext(text) {
    save({ ...data, campaignContext: text });
  }

  function addPartyMember(fields) {
    const member = { ...fields, id: makeId(), files: [] };
    save({ ...data, partyMembers: [...data.partyMembers, member] });
  }

  function updatePartyMember(id, fields) {
    save({
      ...data,
      partyMembers: data.partyMembers.map(m => (m.id === id ? { ...m, ...fields } : m)),
    });
  }

  function deletePartyMember(id) {
    save({ ...data, partyMembers: data.partyMembers.filter(m => m.id !== id) });
  }

  function addFileToMember(memberId, fileRecord) {
    save({
      ...data,
      partyMembers: data.partyMembers.map(m =>
        m.id === memberId ? { ...m, files: [...(m.files || []), fileRecord] } : m
      ),
    });
  }

  function removeFileFromMember(memberId, fileId) {
    save({
      ...data,
      partyMembers: data.partyMembers.map(m =>
        m.id === memberId
          ? { ...m, files: (m.files || []).filter(f => f.id !== fileId) }
          : m
      ),
    });
  }

  return {
    campaignContext: data.campaignContext,
    partyMembers: data.partyMembers,
    setCampaignContext,
    addPartyMember,
    updatePartyMember,
    deletePartyMember,
    addFileToMember,
    removeFileFromMember,
  };
}
