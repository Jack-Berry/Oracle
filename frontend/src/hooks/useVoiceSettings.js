import { useState, useCallback } from 'react';

const KEY = 'oracle_voice_settings';

const DEFAULTS = {
  ttsEnabled: true,    // master switch — when false, no /api/tts calls are made
  autoSpeak: false,
  pitch: 1.0,
  voiceId: '',         // ElevenLabs voice_id
  pitchShift: 0,       // semitones — Tone.js PitchShift on the wet source
  pitchMix: 0,         // 0 = dry only, 1 = pitch-shifted only
  reverb: 0,
  reverbTime: 2.0,
  reverbDecay: 2.0,
  delay: 0,
  delayTime: 0.25,
  delayFeedback: 0.3,
};

export function useVoiceSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS;
      const stored = JSON.parse(raw);
      return { ...DEFAULTS, ...stored };
    } catch {
      return DEFAULTS;
    }
  });

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { settings, updateSetting };
}
