const { Router } = require('express');
const { spawn } = require('child_process');
const { readFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const router = Router();

// ─── TTS synthesis via macOS `say` + `afconvert` ────────────────────────────
//
// Chrome's AudioContext.decodeAudioData() does not support AIFF — it accepts
// WAV, MP3, OGG, AAC, FLAC, and Opus. `say` outputs AIFF by default, so we
// pipe it through `afconvert` (always present on macOS) to get PCM WAV, which
// every browser can decode without issue.

function synthesise(text, voiceName) {
  return new Promise((resolve, reject) => {
    const base    = join(tmpdir(), `oracle_tts_${Date.now()}`);
    const aifPath = `${base}.aif`;
    const wavPath = `${base}.wav`;

    // Step 1: say → AIFF
    const sayArgs = ['-o', aifPath];
    if (voiceName) sayArgs.push('-v', voiceName);
    sayArgs.push('--', text);

    const sayProc = spawn('say', sayArgs);
    sayProc.on('error', reject);
    sayProc.on('close', sayCode => {
      if (sayCode !== 0) return reject(new Error(`say exited with code ${sayCode}`));

      // Step 2: afconvert AIFF → WAV (signed 16-bit PCM, universally supported)
      const cvtProc = spawn('afconvert', ['-f', 'WAVE', '-d', 'LEI16', aifPath, wavPath]);
      cvtProc.on('error', err => {
        try { unlinkSync(aifPath); } catch {}
        reject(err);
      });
      cvtProc.on('close', cvtCode => {
        try { unlinkSync(aifPath); } catch {}
        if (cvtCode !== 0) return reject(new Error(`afconvert exited with code ${cvtCode}`));
        resolve(wavPath);
      });
    });
  });
}

router.post('/tts', async (req, res) => {
  const text = (typeof req.body?.text === 'string' ? req.body.text : '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text too long' });

  const voiceName = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';

  let wavPath;
  try {
    wavPath = await synthesise(text, voiceName || null);
    const audio = readFileSync(wavPath);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audio.length);
    res.send(audio);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS synthesis failed. Is this running on macOS?' });
  } finally {
    if (wavPath) try { unlinkSync(wavPath); } catch {}
  }
});

// ─── Voice list via `say -v ?` ───────────────────────────────────────────────

function listSayVoices() {
  return new Promise((resolve, reject) => {
    const proc = spawn('say', ['-v', '?']);
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.on('close', () => resolve(out));
    proc.on('error', reject);
  });
}

// Novelty/joke voices that are not useful for an Oracle
const NOVELTY_VOICES = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
  'Fred', 'Good News', 'Jester', 'Junior', 'Kathy', 'Organ', 'Ralph',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox',
]);

router.get('/voices', async (req, res) => {
  try {
    const raw = await listSayVoices();
    const voices = raw
      .split('\n')
      .filter(line => /\s{2,}en[_-]/i.test(line))  // English voices only
      .map(line => {
        // Voice names can contain spaces ("Bad News", "Good News", etc.)
        // Format: "Voice Name    en_US    # description"
        // Extract everything before the two-or-more-space locale separator
        const match = line.trim().match(/^(.+?)\s{2,}[a-z]{2}[_-]/i);
        return match ? match[1].trim() : null;
      })
      .filter(name => name && !NOVELTY_VOICES.has(name))
      .sort();
    res.json({ voices });
  } catch (err) {
    console.error('Voice list error:', err.message);
    res.json({ voices: [] });
  }
});

module.exports = router;
