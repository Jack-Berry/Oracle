const { Router } = require('express');

const router = Router();

const BASE = 'https://api.elevenlabs.io/v1';

function apiKey() {
  // ELEVENLABS_API_KEY is the standard underscore form (works across all
  // hosting platforms). The hyphenated `ElevenLabs-API-Key` is the legacy
  // name from the early project .env and is kept as a fallback only.
  return process.env.ELEVENLABS_API_KEY || process.env['ElevenLabs-API-Key'] || '';
}

router.post('/tts', async (req, res) => {
  const text = (typeof req.body?.text === 'string' ? req.body.text : '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 2500) return res.status(400).json({ error: 'text too long' });

  const voiceId = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';
  if (!voiceId) return res.status(400).json({ error: 'voice id is required' });

  const key = apiKey();
  if (!key) return res.status(500).json({ error: 'ElevenLabs API key not configured' });

  try {
    const upstream = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!upstream.ok) {
      const msg = await upstream.text();
      console.error('ElevenLabs TTS error:', upstream.status, msg);
      return res.status(502).json({ error: 'TTS synthesis failed' });
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.send(audio);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS synthesis failed' });
  }
});

router.get('/voices', async (req, res) => {
  const key = apiKey();
  if (!key) return res.json({ voices: [] });

  try {
    const upstream = await fetch(`${BASE}/voices`, {
      headers: { 'xi-api-key': key },
    });

    if (!upstream.ok) return res.json({ voices: [] });

    const data = await upstream.json();
    const voices = (data.voices || [])
      .filter(v => v.category === 'premade')
      .map(v => ({ id: v.voice_id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ voices });
  } catch (err) {
    console.error('Voice list error:', err.message);
    res.json({ voices: [] });
  }
});

module.exports = router;
