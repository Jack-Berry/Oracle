import { useState, useCallback } from 'react';

const KEY = 'oracle_voice_settings';

const DEFAULTS = {
  autoSpeak: false,
  rate: 1.0,           // speech speed (not used by audio engine currently)
  pitch: 1.0,          // primary source playbackRate (affects pitch + speed together)
  voiceURI: '',        // browser TTS fallback voice
  voiceName: '',       // backend 'say' voice name
  pitchShift: 0,       // semitones shift for blended secondary voice (-12 to +12)
  pitchMix: 0,         // blend: 0 = primary only, 1 = shifted only
  reverb: 0,           // reverb wet/dry 0-1
  reverbTime: 2.0,     // reverb tail length in seconds
  reverbDecay: 2.0,    // IR decay steepness (higher = tighter/brighter room)
  delay: 0,            // delay wet/dry 0-1
  delayTime: 0.25,     // echo interval in seconds
  delayFeedback: 0.3,  // feedback amount 0-0.85
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
