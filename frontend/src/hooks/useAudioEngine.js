import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Fetches audio from /api/tts, decodes it, and plays it through a Web Audio
 * effects graph. This gives real, working reverb, delay, and pitch effects.
 *
 * Phase 3 swap: replace the fetch in speak() with any source that returns an
 * ArrayBuffer (ElevenLabs, Google Cloud TTS, etc.) — the effects chain needs
 * no changes.
 *
 * Signal graph:
 *   SourceDry (pitch)       → GainNode(1-pitchMix) ─┐
 *   SourceWet (pitch+shift) → GainNode(pitchMix)   ─┘
 *                                                    ↓ [preEffects]
 *                          ┌──────────────────────── ┤
 *                          ↓                         ↓
 *                    GainNode(1-delay)          DelayNode + FeedbackGain
 *                          ↓                    GainNode(delay)
 *                          └──────────── [postDelay]
 *                          ↓                         ↓
 *                    GainNode(1-reverb)        ConvolverNode
 *                          ↓                    GainNode(reverb)
 *                          └──────────── [destination]
 */

/** Synthetic exponential-decay noise impulse response — simulates room reverb. */
function makeReverbIR(ctx, durationSeconds, decayExponent) {
  const len = Math.max(256, Math.floor(ctx.sampleRate * durationSeconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayExponent);
    }
  }
  return buf;
}

export function useAudioEngine() {
  const ctxRef = useRef(null);
  const activeRef = useRef(null);
  const sourcesRef = useRef([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isBackendAvailable, setIsBackendAvailable] = useState(true);

  function getCtx() {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }

  const stop = useCallback(() => {
    activeRef.current = null;
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current = [];
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text, settings = {}) => {
    if (!text) return;
    stop();

    const token = {};
    activeRef.current = token;

    const {
      pitch = 1,
      pitchShift = 0,
      pitchMix = 0,
      reverb = 0,
      reverbTime = 2,
      reverbDecay = 2,
      delay = 0,
      delayTime = 0.25,
      delayFeedback = 0.3,
      voiceName = '',
    } = settings;

    // ── Fetch audio from backend ──────────────────────────────────────────────
    let audioBuffer;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceName || undefined }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);

      if (activeRef.current !== token) return;

      const arrayBuf = await res.arrayBuffer();
      if (activeRef.current !== token) return;

      audioBuffer = await getCtx().decodeAudioData(arrayBuf);
      setIsBackendAvailable(true);
    } catch (err) {
      console.warn('Audio engine: backend TTS failed, falling back to speechSynthesis', err);
      setIsBackendAvailable(false);
      if (activeRef.current !== token) return;

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = pitch;
        u.onstart = () => setIsSpeaking(true);
        u.onend = () => setIsSpeaking(false);
        u.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(u);
      }
      return;
    }

    if (activeRef.current !== token) return;
    const ctx = getCtx();

    // ── Two-source pitch blend ────────────────────────────────────────────────
    //
    // srcDry plays at the base pitch; srcWet plays at the shifted pitch.
    // pitchMix fades between them. Note: playbackRate changes both pitch and
    // duration, so a lower-pitched source will be longer — the two sources
    // naturally drift apart for large shifts. This is a Web Audio limitation;
    // true pitch-shift-without-timestretch requires a phase vocoder.
    const pitchRate = Math.pow(2, pitchShift / 12);

    const srcDry = ctx.createBufferSource();
    srcDry.buffer = audioBuffer;
    srcDry.playbackRate.value = pitch;

    const srcWet = ctx.createBufferSource();
    srcWet.buffer = audioBuffer;
    srcWet.playbackRate.value = pitch * pitchRate;

    const gainDry = ctx.createGain();
    gainDry.gain.value = Math.max(0, 1 - pitchMix);

    const gainWet = ctx.createGain();
    gainWet.gain.value = Math.max(0, pitchMix);

    const preEffects = ctx.createGain();
    srcDry.connect(gainDry);
    srcWet.connect(gainWet);
    gainDry.connect(preEffects);
    gainWet.connect(preEffects);

    // ── Delay ─────────────────────────────────────────────────────────────────
    const delayNode = ctx.createDelay(5.0);
    delayNode.delayTime.value = Math.max(0.001, delayTime);

    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = Math.min(0.9, delayFeedback);

    const delayWetGain = ctx.createGain();
    delayWetGain.gain.value = delay;

    const delayDryGain = ctx.createGain();
    delayDryGain.gain.value = 1 - delay;

    preEffects.connect(delayDryGain);
    preEffects.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(delayWetGain);

    const postDelay = ctx.createGain();
    delayDryGain.connect(postDelay);
    delayWetGain.connect(postDelay);

    // ── Reverb ────────────────────────────────────────────────────────────────
    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbIR(ctx, reverbTime, reverbDecay);

    const reverbWetGain = ctx.createGain();
    reverbWetGain.gain.value = reverb;

    const reverbDryGain = ctx.createGain();
    reverbDryGain.gain.value = 1 - reverb;

    postDelay.connect(reverbDryGain);
    postDelay.connect(convolver);
    convolver.connect(reverbWetGain);

    reverbDryGain.connect(ctx.destination);
    reverbWetGain.connect(ctx.destination);

    // ── Playback ──────────────────────────────────────────────────────────────
    sourcesRef.current = [srcDry, srcWet];

    let endedCount = 0;
    function onEnded() {
      endedCount++;
      if (endedCount >= 2 && activeRef.current === token) setIsSpeaking(false);
    }
    srcDry.onended = onEnded;
    srcWet.onended = onEnded;

    setIsSpeaking(true);
    srcDry.start();
    srcWet.start();
  }, [stop]);

  useEffect(() => () => {
    stop();
    ctxRef.current?.close();
  }, [stop]);

  return { isSpeaking, isBackendAvailable, speak, stop };
}
