import { useState, useEffect, useCallback } from 'react';

/**
 * Browser speech synthesis wrapper.
 * speak(text, options) cancels any in-progress speech then starts a new one.
 *
 * Swap point for phase 3: replace speak() with a call to a backend TTS
 * pipeline (ElevenLabs, SSML, audio effects chain, etc.) while keeping the
 * same isSpeaking / stop() surface so callers need no changes.
 */
export function useSpeechSynthesis() {
  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    if (!isSupported) return;
    function load() {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    }
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    // Chrome sometimes fires voiceschanged before the listener is registered.
    // A short retry picks up voices that are already available but were missed.
    const t = setTimeout(load, 100);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      clearTimeout(t);
    };
  }, [isSupported]);

  // reverb and delay are accepted here so callers don't need changing in phase 3,
  // but browser speechSynthesis routes audio directly to the OS — Web Audio API
  // cannot intercept it, so these values are stored only and not yet applied.
  const speak = useCallback((text, { rate = 1, pitch = 1, voiceURI = '', reverb = 0, delay = 0 } = {}) => { // eslint-disable-line no-unused-vars
    if (!isSupported || !text) return;
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;

    if (voiceURI) {
      const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceURI);
      if (v) u.voice = v;
    }

    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(u);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  // Cancel on unmount
  useEffect(() => () => stop(), [stop]);

  return { isSupported, isSpeaking, voices, speak, stop };
}
