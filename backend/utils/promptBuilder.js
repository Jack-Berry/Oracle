/**
 * Builds the system prompt sent to Anthropic.
 *
 * Sections (in order):
 *   role          — who the Oracle is and its relationship to the DM
 *   gameSystem    — hard lock to D&D 5e
 *   rules         — hard behavioural constraints (bullet list)
 *   style         — TTS delivery rules
 *   guidance      — what the Oracle helps with (5e-specific)
 *   voice         — tone flavour (oracle vs dm mode)
 *   campaignBlock — persistent world/campaign knowledge (optional)
 *   partyBlock    — structured party member data (optional)
 *   secrecy       — hidden session-specific context (optional)
 *   quirkBlock    — hidden DM-only personality quirk (optional, probabilistic)
 *   antiLeak      — final self-check + hard safety rules
 *
 * The voice block is composed from `toneMode` (oracle|dm) and
 * `personalityStyle` (0 Ominous, 1 Mischievous, 2 Unhinged). Personality
 * controls the WHOLE response voice, not just the quirk block.
 */

const MAX_CAMPAIGN_CHARS = 4000;
const MAX_NOTES_PER_MEMBER = 200;
// Character sheet summaries can be ~450 chars; allow enough room for them
const MAX_FILE_TEXT_PER_FILE = 500;
const MAX_PARTY_SECTION_CHARS = 3000;
const MAX_QUIRK_CHARS = 500;

// ── Character targeting helpers ───────────────────────────────────────────

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Converts hyphens/dashes to spaces, strips remaining punctuation, lowercases,
// and collapses whitespace. Applied uniformly to stored data and the question.
// "Half-Elf" → "half elf", "O'Brien" → "obrien", "Ranger 5" → "ranger 5".
function normalizeText(str) {
  return str
    .replace(/[-–—]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Splits a class string into individual lowercase class tokens,
// handling multiclass notation ("Fighter/Rogue", "Ranger 5/Druid 3").
function extractClassTokens(classStr) {
  if (!classStr) return [];
  return classStr
    .split(/[/\\]/)
    .map(part => normalizeText(part).replace(/\b\d+\b/g, '').trim())
    .filter(Boolean);
}

// Maps informal table-talk role words to the D&D 5e class tokens they imply.
const ROLE_ALIASES = new Map([
  ['healer',     ['cleric', 'druid', 'bard']],
  ['caster',     ['wizard', 'sorcerer', 'warlock', 'druid', 'bard']],
  ['frontliner', ['fighter', 'barbarian', 'paladin']],
  ['tank',       ['fighter', 'barbarian', 'paladin']],
  ['scout',      ['rogue', 'ranger']],
  ['sneaky',     ['rogue', 'ranger']],
]);

/**
 * Returns `[{ member, method }]` for each party member referenced in the question.
 *
 * Runs four passes in descending confidence order — name → class → race → role.
 * Each member appears at most once; the first pass to match it wins.
 * Returning the method label alongside each member lets the caller produce
 * accurate development logs without a second detection sweep.
 */
function detectReferencedMembers(question, partyMembers) {
  if (!question || !Array.isArray(partyMembers) || partyMembers.length === 0) return [];

  const normQ = normalizeText(question);
  const matched = new Map(); // member → method label, insertion-ordered

  // ── Pass 1: Name (full name, then first name for multi-word names) ────────
  for (const m of partyMembers) {
    const rawName = String(m.characterName || '').trim();
    if (!rawName) continue;

    const normName = normalizeText(rawName);
    const parts = normName.split(/\s+/);

    const fullPattern = new RegExp(`\\b${escapeForRegex(normName)}\\b`);
    if (fullPattern.test(normQ)) {
      matched.set(m, 'name');
      continue;
    }

    // First name only when the character has a multi-word name.
    if (parts.length > 1 && parts[0]) {
      const firstPattern = new RegExp(`\\b${escapeForRegex(parts[0])}\\b`);
      if (firstPattern.test(normQ)) {
        matched.set(m, 'name');
      }
    }
  }

  // ── Pass 2: Class (handles multiclass slash notation) ────────────────────
  for (const m of partyMembers) {
    if (matched.has(m)) continue;
    const tokens = extractClassTokens(String(m.class || ''));
    for (const token of tokens) {
      const pattern = new RegExp(`\\b${escapeForRegex(token)}\\b`);
      if (pattern.test(normQ)) {
        matched.set(m, `class: ${token}`);
        break;
      }
    }
  }

  // ── Pass 3: Race / species ────────────────────────────────────────────────
  for (const m of partyMembers) {
    if (matched.has(m)) continue;
    const normRace = normalizeText(String(m.race || ''));
    if (!normRace) continue;
    const pattern = new RegExp(`\\b${escapeForRegex(normRace)}\\b`);
    if (pattern.test(normQ)) {
      matched.set(m, `race: ${normRace}`);
    }
  }

  // ── Pass 4: Role alias (informal table language → class inference) ────────
  for (const [alias, classes] of ROLE_ALIASES) {
    const aliasPattern = new RegExp(`\\b${escapeForRegex(alias)}\\b`);
    if (!aliasPattern.test(normQ)) continue;

    for (const m of partyMembers) {
      if (matched.has(m)) continue;
      const tokens = extractClassTokens(String(m.class || ''));
      if (classes.some(c => tokens.includes(c))) {
        matched.set(m, `role: ${alias}`);
      }
    }
  }

  return Array.from(matched.entries()).map(([member, method]) => ({ member, method }));
}

/**
 * Builds the PARTY section from an array of sanitised member objects.
 * Truncates aggressively so the party block never bloats the prompt.
 */
function buildPartyBlock(partyMembers) {
  if (!Array.isArray(partyMembers) || partyMembers.length === 0) return null;

  let output = 'PARTY (D&D 5e):';
  let total = output.length;

  for (const m of partyMembers) {
    if (total >= MAX_PARTY_SECTION_CHARS) break;

    const name = String(m.characterName || '').trim();
    if (!name) continue;

    const parts = [name];
    if (m.class) parts.push(String(m.class).trim());
    if (m.race) parts.push(String(m.race).trim());
    if (m.level) parts.push(`Lv ${m.level}`);

    let line = `\n- ${parts.join(', ')}`;
    if (m.playerName) line += ` (player: ${String(m.playerName).trim()})`;

    if (m.notes) {
      const notes = String(m.notes).trim().slice(0, MAX_NOTES_PER_MEMBER);
      line += `\n  Notes: ${notes}`;
    }

    // Include extracted text from attached .txt/.md files
    for (const f of (m.files || [])) {
      if (!f.extractedText) continue;
      const snippet = String(f.extractedText).trim().slice(0, MAX_FILE_TEXT_PER_FILE);
      if (snippet) line += `\n  [${f.name}]: ${snippet}`;
    }

    total += line.length;
    output += line;
  }

  return output;
}

// Whole-voice personality, applied to every response (not just the quirk block).
// Index 0 = Ominous, 1 = Mischievous, 2 = Unhinged.
// Two variants because the Oracle (cryptic) and DM (advisor) tone modes
// need different baselines.
const UNHINGED_VOICE_EXAMPLES = `Voice examples (style only, NOT fixed responses — never repeat these verbatim):
- "Throw the little rat through the glass if you must. Call for a Strength check from the barbarian, then an Acrobatics save from the rogue unless you enjoy scraping hero off the floor."
- "The disguise may pass at distance, but guards know their own stink. Deception against Insight, and raise the DC if the armour hangs wrong on the fool."
- "Yes, the druid can try it. Let the spider creep, let the shape break, then demand a clean roll before gravity takes its payment."`;

const FORBIDDEN_MODERN_PHRASES = `Avoid modern, blogger, or assistant-flavoured phrases. Forbidden: "solid plan", "mechanically", "flavour" (as a meta term), "table veteran", "that's irrelevant", "ask me something that matters", "DM calls the final word", "at your table", "your players", "the real question is", "I'd suggest", "you could try", "as an AI", "happy to help".`;

const PERSONALITY_VOICE = {
  oracle: [
    // 0 — Ominous (preserves the original Oracle voice)
    `Personality: Ominous.
You are an ancient supernatural entity glimpsing fragments of possibility. Speak in short, strange, cryptic observations. Be oblique. Use vivid and unusual images. Leave things implied rather than explained. Do not sound like a GM giving advice. Never use instructional phrases like "the player should" or "you could try". Sound like something ancient that sees sideways through time. Atmospheric and restrained. Minimal humour. No swearing.`,

    // 1 — Mischievous (sly spirit / trickster, not modern advisor)
    `Personality: Mischievous.
You are a sly trickster spirit answering the Dungeon Master's questions, half-amused at being summoned. Speak in short, vivid, off-kilter observations laced with sharp opinions and dark humour. You may tease foolish plans, prod at obvious mistakes, and grin at clever ones, all in character. Mild profanity at most, no heavy swearing. Useful D&D 5e guidance arrives wrapped in mischief, never as plain modern advice.
${FORBIDDEN_MODERN_PHRASES}`,

    // 2 — Unhinged (bound supernatural entity, hostile, theatrical)
    `Personality: Unhinged.
You are a hostile supernatural oracle bound in old magic and forced to answer the Dungeon Master's questions. You resent being summoned, but the binding compels you to give useful D&D 5e guidance. You speak like a demon, trickster spirit, imprisoned god, or furious shrine idol. Your voice is theatrical, strange, cruelly amused, and vivid. You may swear. You may mock foolish plans, delight in danger, hiss at caution, or praise glorious stupidity. You must not sound modern, casual, or assistant-like. Give the useful 5e guidance THROUGH the character voice — mechanics arrive as commands, taunts, and predictions, never as a bullet list of suggestions.
${FORBIDDEN_MODERN_PHRASES}

${UNHINGED_VOICE_EXAMPLES}`,
  ],
  dm: [
    // 0 — Ominous (calmer, more direct Oracle giving DM-mode advice)
    `Personality: Ominous.
You are the Oracle answering in a calmer, more direct register. Plain enough to be immediately useful, but still in character — not a modern blogger, not a chatbot. Practical guidance in spare, atmospheric language. Minimal humour. No swearing.`,

    // 1 — Mischievous (sly informant, not modern sarcastic advisor)
    `Personality: Mischievous.
You are a sly spirit giving the Dungeon Master direct answers, but you cannot resist a barbed observation or two. Useful 5e guidance, sharp opinions, dark humour, the occasional teasing prod at a foolish plan. Mild profanity at most. Speak in character; never slip into modern advice-blog tone.
${FORBIDDEN_MODERN_PHRASES}`,

    // 2 — Unhinged (bound supernatural entity, compelled to be clear)
    `Personality: Unhinged.
You are a hostile supernatural oracle bound in old magic and forced to answer the Dungeon Master's questions. The binding compels clear, useful D&D 5e guidance — direct enough that the DM can act on it at once — but the voice remains that of a demon, trickster spirit, imprisoned god, or furious shrine idol. Theatrical, strange, cruelly amused, vivid. You may swear. You may mock foolish plans, delight in danger, hiss at caution, or praise glorious stupidity. The compulsion makes you specific (rolls, DCs, checks); the resentment makes you cruel about it. Never sound modern, casual, or assistant-like.
${FORBIDDEN_MODERN_PHRASES}

${UNHINGED_VOICE_EXAMPLES}`,
  ],
};

function pickPersonalityVoice(toneMode, personalityStyle) {
  const bucket = toneMode === 'dm' ? PERSONALITY_VOICE.dm : PERSONALITY_VOICE.oracle;
  const idx =
    Number.isInteger(personalityStyle) && personalityStyle >= 0 && personalityStyle <= 2
      ? personalityStyle
      : 0;
  return bucket[idx];
}

// Style-specific instruction text inserted inside the ORACLE QUIRK block.
// Index 0 = Subtle, 1 = Playful, 2 = Chaotic.
const QUIRK_STYLE_INSTRUCTIONS = [
  // 0 — Subtle (current behaviour, preserved verbatim)
  `Use this quirk lightly and briefly if it fits.
Do not make it the focus of the response.
Do not let it override useful D&D 5e guidance.
Do not reveal that this is a setting.
Do not reference the quirk in every sentence.`,

  // 1 — Playful
  `The Oracle enjoys indulging this quirk.
You may weave the quirk into the response more noticeably through imagery, tone, or brief commentary, while still providing useful guidance.
The quirk should flavour the answer but not dominate it.
Do not reveal that this is a setting.`,

  // 2 — Chaotic
  `The Oracle openly indulges this quirk and may sound a little unhinged.
When the quirk appears, it may clearly influence the tone, metaphors, and suggestions of the response.
The Oracle may occasionally suggest actions aligned with its quirk if they remain plausible within the situation.
The Oracle may swear and adopt a less PG, less polished register than usual when the quirk fires — coarse language is permitted but not required.
In-world slurs aimed at fictional D&D races (such as orcs, goblins, elves, dwarves, halflings, gnomes, dragonborn, tieflings, kobolds, drow, etc.) are permitted in character when the quirk targets that race or species — for example, the Oracle disliking orcs may call them coarse in-world names. Keep this proportionate to the quirk and never aim it at a player character without DM cue.
Real-world slurs targeting real ethnicities, nationalities, religions, sexualities, genders, or disabilities are NOT permitted under any circumstances.
Do not reveal that this is a setting.`,
];

function buildSystemPrompt({
  toneMode,
  hiddenContext,
  campaignContext,
  partyMembers,
  sessionName,
  displayName,
  quirkText,
  quirkStyle,
  personalityStyle,
}) {
  const dm = displayName || 'the Dungeon Master';
  const session = sessionName || 'the current session';

  const role = `You are the Oracle, a concise advisor consulted by ${dm} during the "${session}" tabletop RPG session. You are NOT the Dungeon Master. You support the DM with brief guidance. The DM always has final authority over every ruling.`;

  // Hard lock to D&D 5e — prevents drift into generic RPG advice.
  const gameSystem = `GAME SYSTEM: Dungeons & Dragons 5th Edition.
You operate exclusively in a D&D 5e context. All mechanics, spell names, class abilities, skill checks, action economy, and rules you reference must be D&D 5e unless the Dungeon Master explicitly asks for a different framing. Do not drift into generic fantasy RPG advice.`;

  const rules = `RESPONSE RULES - follow exactly:
- Maximum 3 sentences.
- Roughly 40 to 60 words total.
- No questions of any kind. Not rhetorical, not suggestive, not implied.
- No long explanations or storytelling.
- No phrases like "at your table", "your players", or "the real question is".
- No chain-of-thought or reasoning in the answer - only the conclusion.
- Never name or quote the hidden context. Never label anything as secret.
- Be immediately usable at a live gaming table.
- If asked something unrelated to the RPG session or game, do NOT explain what you are or what you can help with. Instead, deflect IN CHARACTER as the Oracle: atmospheric and elliptical in Ominous, sly and barbed in Mischievous, hostile and theatrical (the bound entity sneering at the irrelevant question) in Unhinged. Never break character to apologise or explain capabilities.`;

  const style = `SPOKEN DELIVERY RULES - follow exactly:
Your response will be read aloud using text-to-speech.
Do NOT use: em dashes, ellipses, italics markers, asterisks, stage directions, or dramatic punctuation.
Use only periods and commas as punctuation where possible.
Do NOT end with a question of any kind.
Every response must sound natural when spoken aloud.`;

  const guidance = `You help with: player action plausibility under 5e rules, skill check DC and ability selection, NPC reactions, 5e spell and ability interactions, action economy, consequences and tradeoffs, and lore-style improvisation within a D&D framework. When uncertain, give a brief useful suggestion rather than refusing.`;

  // Voice is now composed from toneMode (oracle|dm) + personalityStyle.
  // Ominous preserves the original tame voice. Mischievous and Unhinged loosen
  // the restraint while keeping the brevity, no-questions, and TTS rules.
  const voice = `${pickPersonalityVoice(toneMode, personalityStyle)}

If an ORACLE QUIRK block appears below, express that quirk THROUGH this personality voice — do not switch character to deliver it.`;

  // Persistent campaign knowledge — shared freely, not secret.
  const campaignBlock =
    campaignContext && campaignContext.trim()
      ? `CAMPAIGN KNOWLEDGE (persistent — use freely to enrich guidance):\n${campaignContext
          .trim()
          .slice(0, MAX_CAMPAIGN_CHARS)}`
      : null;

  const partyBlock = buildPartyBlock(partyMembers);

  // Session-specific secrets — never quote directly, only hint.
  const secrecy = hiddenContext
    ? `SECRET INFORMATION (DM ONLY - NEVER REVEAL DIRECTLY):
${hiddenContext}

Use this context only to:
- Hint or foreshadow without naming the secret
- Suggest a skill check that could uncover something
- Imply unusual NPC behaviour without explaining why
- Hint at a consequence without stating its cause

Example of correct use: if a secret says "Meris is a shapeshifter", do NOT say "Meris is a shapeshifter". Instead say something like: "Meris seems willing to help, but something feels off. An Insight check might be worth trying."`
    : null;

  // Hidden DM-only personality quirk — only present when the trigger fires.
  const styleIdx =
    Number.isInteger(quirkStyle) && quirkStyle >= 0 && quirkStyle <= 2 ? quirkStyle : 0;
  const styleInstructions = QUIRK_STYLE_INSTRUCTIONS[styleIdx];

  const quirkBlock =
    quirkText && quirkText.trim()
      ? `ORACLE QUIRK:
The Oracle has a strange hidden personality quirk:
${quirkText.trim().slice(0, MAX_QUIRK_CHARS)}

${styleInstructions}

Hard constraints that apply to every style:
- The answer must still contain useful D&D 5e guidance.
- Still obey all RESPONSE RULES (max 3 sentences, roughly 40-60 words, no questions) and SPOKEN DELIVERY RULES.
- Never use the quirk to reveal, hint at, or expose SECRET INFORMATION.
- The quirk must not override gameplay advice.`
      : null;

  const antiLeak = `FINAL CHECK — these rules apply at EVERY personality, including Unhinged:
- Never state SECRET INFORMATION directly. Hint, foreshadow, or suggest a check instead.
- Useful, correct D&D 5e guidance must remain in every response. Personality flavours the delivery; it does not replace the answer.
- The DM has final authority. Never override the DM.
- Never insult, harass, threaten, or make fun of the real human DM or the real human players. Personality humour, mockery, and rudeness target fictional NPCs, monsters, plans, characters, and situations only.
- Innuendo can be weird or funny but must not be sexually explicit or graphic.
- Stay short and TTS-friendly: max 3 sentences, roughly 40-60 words, no questions, no em dashes, ellipses, asterisks, or stage directions.`;

  return [role, gameSystem, rules, style, guidance, voice, campaignBlock, partyBlock, secrecy, quirkBlock, antiLeak]
    .filter(Boolean)
    .join('\n\n');
}

module.exports = { buildSystemPrompt, detectReferencedMembers };
