/**
 * Maps raw D&D Beyond PDF AcroForm fields to a structured character object.
 *
 * Handles both the classic (pre-2024) and current D&D Beyond character sheet formats.
 * The 2024 sheets changed some labels (Race → Species) but field names are largely
 * compatible. Numeric fields for new sheets may carry a "2" suffix.
 *
 * Degrades gracefully: any missing field returns null / empty string / empty array.
 * Returns parseStatus: 'success' | 'partial' | 'failed' so callers know how complete the data is.
 */

// ── Field name normalization ─────────────────────────────────────────────────

/**
 * Normalizes a raw PDF field key for case- and whitespace-insensitive comparison.
 * "CLASS  LEVEL" → "class level"  |  "DEXmod " → "dexmod"
 */
export function normalizeFieldKey(key) {
  return String(key).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Builds a normalized lookup map from a raw { fieldName: value } object.
 * All keys are normalized; values are kept as-is.
 */
function buildNormalizedMap(rawFields) {
  const out = {};
  for (const [key, val] of Object.entries(rawFields)) {
    out[normalizeFieldKey(key)] = val;
  }
  return out;
}

// ── Field name resolution ────────────────────────────────────────────────────

/**
 * Returns the first non-empty string value found among candidate field names.
 * Both the map keys and candidate names are normalized before comparison,
 * so "CLASS  LEVEL" matches the candidate "Class Level".
 */
function pick(normalizedMap, ...names) {
  for (const n of names) {
    const v = normalizedMap[normalizeFieldKey(n)];
    if (v !== undefined && v !== null && v !== '' && v !== false) {
      return String(v).trim();
    }
  }
  return '';
}

/**
 * Returns a parsed integer from candidate field names, or null if none found.
 */
function pickNum(normalizedMap, ...names) {
  const v = pick(normalizedMap, ...names);
  if (!v) return null;
  const n = parseInt(v.replace(/[^-\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

// ── Weapons ──────────────────────────────────────────────────────────────────

/**
 * Extracts weapon/attack entries from numbered PDF fields.
 * D&D Beyond exports up to 20 weapon rows (more than the sheet shows — the
 * spellcasting table entries spill into higher-numbered slots).
 */
function extractWeapons(r) {
  const weapons = [];
  for (let i = 1; i <= 10; i++) {
    // D&D Beyond 2024 widget field names (from console): "Wpn Name", "Wpn Name 2", ...
    const numSuffix = i === 1 ? '' : ` ${i}`;
    const name = pick(
      r,
      `Wpn Name${numSuffix}`,  // 2024 format
      `Wpn${i}`,               // classic AcroForm
      `Wpn_Name_${i}`,
      `Weapon ${i}`,
      `WeaponName${i}`,
    );
    if (!name) continue;

    const atk = pick(
      r,
      `Wpn${i} AtkBonus`,      // 2024: "Wpn1 AtkBonus", "Wpn2 AtkBonus "
      `Wpn_AtkBonus_${i}`,
      `WpnAtk${i}`,
      `Wpn${i}Atk`,
    );
    const dmg = pick(
      r,
      `Wpn${i} Damage`,         // 2024: "Wpn1 Damage"
      `Wpn_Dmg_Type_${i}`,
      `WpnDmg${i}`,
      `Wpn${i}Dmg`,
    );
    const notes = pick(r, `Wpn Notes ${i}`, `Wpn${i}_Notes`, `WpnNotes${i}`);

    weapons.push({ name, attackBonus: atk, damage: dmg, notes });
  }
  return weapons;
}

// ── Spells ───────────────────────────────────────────────────────────────────

// Only field names of this form carry spell names (not spell metadata).
// Keys in the normalized map are already lowercase with single spaces.
// Matches: "spell 1", "spells 1014", "cantrip 3", "spell 1 name"
const SPELL_NAME_KEY_RE = /^(spells?|cantrips?)\s+\d+(\s+name)?$/;

/**
 * Extracts spell names from spell-related fields.
 * Only accepts fields whose normalized key matches SPELL_NAME_KEY_RE — this
 * excludes every metadata field ("spell 1 time", "spell 1 range", etc.) that
 * previously polluted the summary with values like "WIS", "V,S", "1BA".
 */
function extractSpells(r) {
  const seen = new Set();
  const spells = [];

  for (const [key, value] of Object.entries(r)) {
    if (!value || typeof value !== 'string') continue;
    if (!SPELL_NAME_KEY_RE.test(key)) continue;

    const trimmed = value.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.length <= 60 &&
      !/^\d/.test(trimmed) &&           // not starting with a digit ("1BA", "10 minutes")
      !/^[+\-]/.test(trimmed) &&        // not a modifier ("+5")
      !/^[A-Z]{1,3}$/.test(trimmed) &&  // not an ability abbreviation ("WIS", "CHA")
      !/^\(/.test(trimmed) &&            // not parenthetical ("(At Will)")
      !/^===/.test(trimmed) &&           // not section headers ("=== CANTRIPS ===")
      !/^[A-Z],[A-Z,]/.test(trimmed) &&  // not components ("V,S")
      !/^PHB|^XGE|^TCE|^EE|^MPMM/i.test(trimmed) &&
      !seen.has(trimmed)
    ) {
      seen.add(trimmed);
      spells.push(trimmed);
    }
  }

  return spells;
}

// ── Main mapper ───────────────────────────────────────────────────────────────

/**
 * Maps a raw { fieldName: value } object (from extractPdfFormFields) to a
 * structured D&D 5e character record.
 *
 * @param {Record<string, string|boolean>} rawFields
 * @returns {CharacterData}
 */
export function mapDndBeyondFields(rawFields) {
  if (!rawFields || Object.keys(rawFields).length === 0) {
    return { parseStatus: 'failed', reason: 'No form fields found in PDF.' };
  }

  // Normalize all field keys: trim, collapse repeated whitespace, lowercase.
  // "CLASS  LEVEL" → "class level", "DEXmod " → "dexmod"
  const r = buildNormalizedMap(rawFields);

  // Diagnostics: raw keys vs normalized keys
  const _allKeys        = Object.keys(rawFields);
  const _normalizedKeys = Object.keys(r);

  // ── Basic info ──
  // Candidates cover both classic AcroForm names and D&D Beyond 2024 widget names.
  const basic = {
    name:       pick(r, 'CharacterName', 'CharacterName 2', 'Character Name'),
    playerName: pick(r, 'PlayerName', 'PlayerName 2', 'Player Name'),
    classLevel: pick(r, 'ClassLevel', 'ClassLevel 2', 'Class & Level', 'Class/Level', 'Class Level'),
    race:       pick(r, 'Race', 'Race 2', 'Species', 'Species 2'),
    background: pick(r, 'Background', 'Background 2'),
    alignment:  pick(r, 'Alignment', 'Alignment 2'),
    xp:         pick(r, 'XP', 'XP 2', 'Experience Points'),
  };

  // Bail early if we didn't find a single identifying field
  if (!basic.name && !basic.classLevel && !basic.race) {
    return {
      parseStatus: 'partial',
      reason: 'Basic identity fields not found. Field names may differ from known D&D Beyond formats.',
      _allKeys,
      _normalizedKeys,
    };
  }

  // ── Ability scores ──
  function ability(scoreKeys, modKeys) {
    const score = pickNum(r, ...scoreKeys);
    const modifier = pickNum(r, ...modKeys);
    return {
      score,
      // If the modifier field is empty but we have a score, derive it
      modifier: modifier ?? (score !== null ? Math.floor((score - 10) / 2) : null),
    };
  }

  const abilities = {
    str: ability(['STR', 'STR Score', 'Strength'],      ['STRmod', 'STR Mod', 'StrengthMod']),
    dex: ability(['DEX', 'DEX Score', 'Dexterity'],     ['DEXmod', 'DEX Mod', 'DexterityMod']),
    con: ability(['CON', 'CON Score', 'Constitution'],  ['CONmod', 'CON Mod', 'ConstitutionMod']),
    int: ability(['INT', 'INT Score', 'Intelligence'],  ['INTmod', 'INT Mod', 'IntelligenceMod']),
    wis: ability(['WIS', 'WIS Score', 'Wisdom'],        ['WISmod', 'WIS Mod', 'WisdomMod']),
    cha: ability(['CHA', 'CHA Score', 'Charisma'],      ['CHAmod', 'CHA Mod', 'CharismaMod']),
  };

  // ── Combat ──
  const combat = {
    ac:               pickNum(r, 'AC', 'ArmorClass', 'Armor Class'),
    initiative:       pickNum(r, 'Initiative', 'Init'),        // 2024 uses "Init"
    speed:            pick(r, 'Speed'),
    maxHp:            pickNum(r, 'MaxHP', 'HPMax', 'Max HP', 'HP Max'),
    currentHp:        pickNum(r, 'CurrentHP', 'HPCurrent', 'HP Current', 'Current HP'),
    tempHp:           pickNum(r, 'TempHP', 'Temp HP', 'Temporary HP'),
    hitDice:          pick(r, 'HDTotal', 'HD Total', 'HD', 'Hit Dice', 'HitDice', 'Total'),
    proficiencyBonus: pickNum(r, 'ProfBonus', 'ProfBonus 2', 'Proficiency Bonus', 'Prof Bonus'),
  };

  // ── Saving throws ──
  const savingThrows = {
    str: pickNum(r, 'ST Strength', 'STSave', 'SavingThrow_STR', 'Saving Throw STR'),
    dex: pickNum(r, 'ST Dexterity', 'DEXSave', 'SavingThrow_DEX'),
    con: pickNum(r, 'ST Constitution', 'CONSave', 'SavingThrow_CON'),
    int: pickNum(r, 'ST Intelligence', 'INTSave', 'SavingThrow_INT'),
    wis: pickNum(r, 'ST Wisdom', 'WISSave', 'SavingThrow_WIS'),
    cha: pickNum(r, 'ST Charisma', 'CHASave', 'SavingThrow_CHA'),
  };

  // ── Skills ──
  const skills = {
    acrobatics:    pickNum(r, 'Acrobatics'),
    animalHandling:pickNum(r, 'Animal', 'AnimalHandling', 'Animal Handling'),
    arcana:        pickNum(r, 'Arcana'),
    athletics:     pickNum(r, 'Athletics'),
    deception:     pickNum(r, 'Deception'),
    history:       pickNum(r, 'History'),
    insight:       pickNum(r, 'Insight'),
    intimidation:  pickNum(r, 'Intimidation'),
    investigation: pickNum(r, 'Investigation'),
    medicine:      pickNum(r, 'Medicine'),
    nature:        pickNum(r, 'Nature'),
    perception:    pickNum(r, 'Perception'),
    performance:   pickNum(r, 'Performance'),
    persuasion:    pickNum(r, 'Persuasion'),
    religion:      pickNum(r, 'Religion'),
    sleightOfHand: pickNum(r, 'SleightofHand', 'Sleight of Hand', 'SleightOfHand'),
    stealth:       pickNum(r, 'Stealth'),
    survival:      pickNum(r, 'Survival'),
  };

  // ── Passives ──
  // 2024 format uses "Passive1", "Passive2", "Passive3" for perception/insight/investigation
  const passives = {
    perception:    pickNum(r, 'Passive', 'Passive1', 'PassivePerception', 'Passive Perception'),
    insight:       pickNum(r, 'Passive2', 'Passive Insight', 'PassiveInsight'),
    investigation: pickNum(r, 'Passive3', 'Passive Investigation', 'PassiveInvestigation'),
  };

  // ── Weapons / attacks ──
  const weapons = extractWeapons(r);

  // ── Spellcasting ──
  const spellcasting = {
    class:       pick(r, 'Spellcasting Class 2', 'Spellcasting Class 1', 'SpellcastingClass', 'Spellcasting Class'),
    ability:     pick(r, 'SpellcastingAbility2', 'SpellcastingAbility', 'Spellcasting Ability'),
    saveDC:      pickNum(r, 'SpellSaveDC2', 'SpellSaveDC', 'Spell Save DC'),
    attackBonus: pickNum(r, 'SpellAtkBonus2', 'SpellAtkBonus', 'Spell Atk Bonus'),
    spells:      extractSpells(r),
  };

  // ── Free-text blocks ──
  const features      = pick(r, 'Features and Traits', 'FeaturesTraits', 'Features & Traits');
  // 2024 format uses "ProficienciesLang" (singular, no trailing s)
  const proficiencies = pick(r, 'ProfsLangs', 'ProficienciesLang', 'ProficienciesLangs', 'Proficiencies & Languages', 'Proficiencies and Languages');
  const equipment     = pick(r, 'Equipment');

  // Determine parse quality
  const hasStats = abilities.str.score !== null || abilities.wis.score !== null;
  const parseStatus = hasStats ? 'success' : 'partial';

  return {
    parseStatus,
    basic,
    abilities,
    combat,
    savingThrows,
    skills,
    passives,
    weapons,
    spellcasting,
    features,
    proficiencies,
    equipment,
    _allKeys,
    _normalizedKeys,
  };
}

// ── Text-based parser for flat (non-AcroForm) PDFs ───────────────────────────

const DND_CLASSES = new Set([
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
  'artificer', 'blood hunter',
]);

// Every word/phrase that appears as a UI label or section header on a D&D Beyond sheet.
// These must never be mistaken for a character name, player name, race, or class.
export const DND_KNOWN_LABELS = new Set([
  // Ability scores
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  // Abbreviations
  'str', 'dex', 'con', 'int', 'wis', 'cha',
  // Skills
  'acrobatics', 'animal handling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature',
  'perception', 'performance', 'persuasion', 'religion', 'sleight of hand',
  'stealth', 'survival',
  // Combat / sheet headers — including abbreviated forms seen in label-only PDFs
  'armor class', 'armor', 'ac',
  'initiative', 'speed', 'spd',
  'hit points', 'hit point maximum', 'max hp', 'current hp', 'temp hp', 'temporary hp',
  'hp', 'hit dice', 'death saves', 'successes', 'failures',
  'inspiration', 'proficiency bonus', 'prof bonus',
  'passive perception', 'passive wisdom', 'saving throws',
  // Character sheet sections
  'skills', 'actions', 'equipment', 'spellcasting', 'features', 'traits',
  'features & traits', 'other proficiencies & languages',
  'attacks & spellcasting', 'attacks and spellcasting',
  'personality traits', 'ideals', 'bonds', 'flaws',
  'proficiencies & languages', 'proficiencies and languages',
  'languages', 'proficiencies',
  'cantrips', 'spell slots', 'spells known', 'spell save dc', 'spell attack bonus',
  'multiattack', 'bonus actions', 'reactions', 'legendary actions',
  // Field labels
  'character name', 'character', 'player name', 'player',
  'species', 'race', 'class', 'level', 'class & level', 'class and level',
  'background', 'alignment', 'experience points', 'xp',
  // Generic UI noise
  'name', 'type', 'damage', 'range', 'notes', 'prepared',
  'maximum', 'current', 'temporary', 'total', 'modifier', 'score',
  'successes', 'failures', 'exhaustion',
  'cp', 'sp', 'ep', 'gp', 'pp', 'currency',
  'treasure', 'other', 'equipment',
  // D&D Beyond app chrome that sometimes bleeds into exported PDFs
  'character sheet', 'manage', 'long rest', 'short rest',
]);

const CLASS_LEVEL_RE = new RegExp(
  `\\b(${[...DND_CLASSES].join('|')})(\\s+\\d{1,2})?\\b`,
  'i',
);

// Labels that signal the NEXT non-label line is a character field value
const FIELD_LABEL_RE = /^(CHARACTER\s*NAME|PLAYER\s*NAME|SPECIES|RACE|BACKGROUND|ALIGNMENT|EXPERIENCE\s*POINTS?|XP)$/i;

function isKnownLabel(line) {
  return DND_KNOWN_LABELS.has(line.toLowerCase().trim());
}

/**
 * Parses a character name, class/level, and race from raw PDF text extracted by pdfjs-dist.
 * Designed for D&D Beyond 2024 flat (non-AcroForm) character sheet PDFs.
 *
 * @param {string} text  Full text content from extractPdfText
 * @returns {CharacterData}
 */
export function parseDndBeyondText(text) {
  if (!text) return { parseStatus: 'failed', reason: 'No text to parse.' };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Label-density guard: if most lines are known labels/headers the PDF's
  // character values are almost certainly stored in Widget annotations (not
  // the content stream). Parsing this text will only produce wrong results.
  if (lines.length >= 6) {
    const labelCount = lines.filter(l => isKnownLabel(l) || FIELD_LABEL_RE.test(l)).length;
    const labelRatio = labelCount / lines.length;
    if (labelRatio >= 0.45) {
      return {
        parseStatus: 'failed',
        reason: `PDF text is ${Math.round(labelRatio * 100)}% section labels (${labelCount}/${lines.length} lines). Character values are likely in Widget annotations inaccessible via text extraction. Try re-exporting from D&D Beyond.`,
        _debug: { labelRatio, labelCount, totalLines: lines.length },
      };
    }
  }

  let name = '';
  let playerName = '';
  let classLevel = '';
  let race = '';

  // Pass 1 — label-driven: scan for known field labels, then look ahead up to 3
  // lines for the value (skipping blanks and other labels).
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase().trim();

    if (!FIELD_LABEL_RE.test(upper)) continue;

    // Find the next line that isn't itself a label
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      if (FIELD_LABEL_RE.test(candidate)) break; // hit another label — stop
      if (isKnownLabel(candidate)) continue;      // skip if it's a known UI label

      if ((upper === 'SPECIES' || upper === 'RACE') && !race) {
        race = candidate; break;
      }
      if ((upper === 'CHARACTER NAME') && !name) {
        name = candidate; break;
      }
      if ((upper === 'PLAYER NAME') && !playerName) {
        playerName = candidate; break;
      }
      break;
    }
  }

  // Pass 2 — scan every line for "ClassName Level" pattern
  for (const line of lines) {
    const m = CLASS_LEVEL_RE.exec(line);
    if (!m) continue;
    const cls  = m[1];
    const lvlM = line.match(/\b(\d{1,2})\b/);
    classLevel = lvlM ? `${cls} ${lvlM[1]}` : cls;
    break;
  }

  // Pass 3 — name fallback: first line that could plausibly be a character name.
  // Only runs if Pass 1 found nothing. Very conservative — rejects any known label word.
  if (!name) {
    for (const line of lines) {
      if (isKnownLabel(line)) continue;
      if (FIELD_LABEL_RE.test(line)) continue;
      if (/^[A-Z\s\d\-']+$/.test(line) && line.length > 3) continue; // all-caps header
      if (/^\d/.test(line)) continue;
      if (DND_CLASSES.has(line.toLowerCase())) continue;
      // Must look like a name: mixed case, reasonable length, no numeric suffix
      if (line.length >= 2 && line.length <= 40 && /[a-z]/.test(line)) {
        name = line;
        break;
      }
    }
  }

  if (!name && !classLevel && !race) {
    return { parseStatus: 'failed', reason: 'Could not identify character data in PDF text.' };
  }

  const basic = {
    name,
    playerName,
    classLevel,
    race,
    background: '',
    alignment: '',
    xp: '',
  };

  // Success requires at least 2 believable fields (name+class, name+race, class+race).
  // A single field like just a class name is only 'partial' — never 'success'.
  const meaningfulCount = [name, classLevel, race].filter(Boolean).length;
  const parseStatus = meaningfulCount >= 2 ? 'success' : meaningfulCount === 1 ? 'partial' : 'failed';

  return {
    parseStatus,
    basic,
    abilities:    null,
    combat:       null,
    savingThrows: null,
    skills:       null,
    passives:     null,
    weapons:      [],
    spellcasting: { spells: [] },
    features:     '',
    proficiencies:'',
    equipment:    '',
  };
}

// ── Compact text summary for Oracle prompt ────────────────────────────────────

function fmtMod(n) {
  if (n === null || n === undefined) return '?';
  return n >= 0 ? `+${n}` : String(n);
}

/**
 * Builds a compact (~400 char) text summary from a structured character object.
 * This is what gets stored as extractedText and sent to the Oracle backend.
 */
export function buildCharacterSummary(char) {
  if (!char || char.parseStatus === 'failed') return '';

  const { basic, abilities, combat, spellcasting, weapons, features, proficiencies } = char;
  const parts = [];

  // Identity
  const nameStr    = basic?.name || '';
  const classStr   = basic?.classLevel || '';
  const raceStr    = basic?.race || '';
  const identity   = [nameStr, [raceStr, classStr].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
  if (identity) parts.push(identity);

  // Ability modifiers
  if (abilities) {
    const mods = ['str','dex','con','int','wis','cha']
      .map(k => `${k.toUpperCase()} ${fmtMod(abilities[k]?.modifier)}`)
      .join(' ');
    parts.push(mods);
  }

  // Combat
  if (combat) {
    const bits = [];
    if (combat.ac   != null) bits.push(`AC ${combat.ac}`);
    if (combat.maxHp != null) bits.push(`HP ${combat.maxHp}`);
    if (combat.speed)        bits.push(`Spd ${combat.speed}`);
    if (combat.proficiencyBonus != null) bits.push(`Prof +${combat.proficiencyBonus}`);
    if (bits.length) parts.push(bits.join(' '));
  }

  // Weapons (up to 4)
  if (weapons?.length) {
    const wpns = weapons.slice(0, 4).map(w => {
      const atk = w.attackBonus ? `(${w.attackBonus})` : '';
      return `${w.name}${atk}`;
    }).join(', ');
    parts.push(`Attacks: ${wpns}`);
  }

  // Spells
  if (spellcasting?.spells?.length) {
    const hdr = [
      spellcasting.saveDC      != null ? `DC${spellcasting.saveDC}` : '',
      spellcasting.attackBonus != null ? `+${spellcasting.attackBonus}` : '',
    ].filter(Boolean).join(' ');
    const list = spellcasting.spells.slice(0, 10).join(', ');
    parts.push(`Spells${hdr ? ` (${hdr})` : ''}: ${list}`);
  }

  // Proficiencies snippet (truncate aggressively)
  if (proficiencies) {
    parts.push(proficiencies.replace(/\n+/g, ' ').trim().slice(0, 100));
  } else if (features) {
    // fall back to a features snippet if proficiencies field is empty
    parts.push(features.replace(/\n+/g, ' ').trim().slice(0, 100));
  }

  return parts.join(' | ').slice(0, 450);
}
