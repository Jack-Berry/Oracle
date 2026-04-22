const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('../utils/promptBuilder');

// Switch models by setting ORACLE_MODEL in .env
const MODEL = process.env.ORACLE_MODEL || 'claude-haiku-4-5';

// Prompt asks for 40-60 words; this is a safety net for occasional overruns.
const WORD_LIMIT = 80;

/**
 * Removes punctuation that is hostile to text-to-speech synthesis.
 * The prompt instructs the model to avoid these, but this acts as a
 * second layer of defence in case the model slips.
 */
function cleanForSpeech(text) {
  return text
    .replace(/—|–/g, ', ')   // em/en dash -> comma pause
    .replace(/\.\.\.|…/g, '.') // ellipsis -> plain period
    .replace(/\*/g, '')        // strip asterisks used for emphasis
    .replace(/  +/g, ' ')      // collapse any double spaces left behind
    .trim();
}

/**
 * Cleans TTS-hostile punctuation, then trims to at most WORD_LIMIT words
 * cutting at the last sentence boundary so output stays grammatically complete.
 */
function sanitiseResponse(text) {
  const cleaned = cleanForSpeech(text);
  const words = cleaned.split(/\s+/);

  if (words.length <= WORD_LIMIT) return cleaned;

  // Build a candidate string at the word limit, then find the last sentence end.
  const candidate = words.slice(0, WORD_LIMIT).join(' ');

  for (let i = candidate.length - 1; i >= 0; i--) {
    if (candidate[i] === '.' || candidate[i] === '!' || candidate[i] === '?') {
      return candidate.slice(0, i + 1).trim();
    }
  }

  // No sentence boundary found — cut at word limit with a closing period.
  return candidate.trimEnd() + '.';
}

function getApiKey() {
  const key = process.env['Anthropic-API-Key'] || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Anthropic API key not configured. Set Anthropic-API-Key in .env');
  return key;
}

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: getApiKey() });
  return _client;
}

async function queryOracle({ question, hiddenContext, toneMode, sessionName, displayName }) {
  const client = getClient();
  const systemPrompt = buildSystemPrompt({ toneMode, hiddenContext, sessionName, displayName });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 200, // tighter ceiling reinforces the brevity rules in the prompt
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  });

  const block = message.content.find(b => b.type === 'text');
  if (!block) throw new Error('No text response received from model.');

  return sanitiseResponse(block.text);
}

module.exports = { queryOracle, sanitiseResponse };
