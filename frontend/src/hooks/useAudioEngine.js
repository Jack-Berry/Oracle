import { useState, useRef, useCallback, useEffect } from 'react';
import { connect as toneConnect, setContext as toneSetContext, PitchShift } from 'tone';

/**
 * Signal graph (backend TTS path):
 *
 *   srcDry (pitch)                       → GainNode(1-pitchMix) ─┐
 *   srcWet (pitch) → Tone.PitchShift(st) → GainNode(pitchMix)   ─┘
 *                                                                  ↓ [preEffects]
 *                         ┌─────────────────────────────────────── ┤
 *                         ↓                                         ↓
 *                   GainNode(1-delay)               DelayNode + FeedbackGain
 *                         ↓                          GainNode(delay)
 *                         └──────────── [postDelay] ─────────────────
 *                         ↓                                         ↓
 *                   GainNode(1-reverb)               ConvolverNode
 *                         ↓                          GainNode(reverb)
 *                         └──────────── [destination]
 *
 * Google voice path (voiceURI set): uses speechSynthesis directly.
 * Pitch and rate are applied via utterance properties.
 * Reverb/delay require the backend buffer path and are not applied here.
 */

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
  const toneNodesRef = useRef([]);
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
    toneNodesRef.current.forEach(n => { try { n.dispose(); } catch {} });
    toneNodesRef.current = [];
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text, settings = {}) => {
    if (!text) return;
    stop();

    const token = {};
    activeRef.current = token;

    const {
      pitch = 1,
      pitchShift: pitchShiftSt = 0,
      pitchMix = 0,
      reverb = 0,
      reverbTime = 2,
      reverbDecay = 2,
      delay = 0,
      delayTime = 0.25,
      delayFeedback = 0.3,
      voiceId = '',
    } = settings;

    // ── ElevenLabs TTS + Web Audio effects path ───────────────────────────────
    let audioBuffer;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceId || undefined }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      if (activeRef.current !== token) return;
      const arrayBuf = await res.arrayBuffer();
      if (activeRef.current !== token) return;
      audioBuffer = await getCtx().decodeAudioData(arrayBuf);
      setIsBackendAvailable(true);
    } catch (err) {
      console.error('Audio engine: TTS failed', err);
      setIsBackendAvailable(false);
      return;
    }

    if (activeRef.current !== token) return;
    const ctx = getCtx();
    toneSetContext(ctx);

    // ── Dry source ────────────────────────────────────────────────────────────
    const srcDry = ctx.createBufferSource();
    srcDry.buffer = audioBuffer;
    srcDry.playbackRate.value = pitch;

    const gainDry = ctx.createGain();
    gainDry.gain.value = Math.max(0, 1 - pitchMix);
    srcDry.connect(gainDry);

    // ── Wet source (Tone.js true pitch shift — no tempo drift) ────────────────
    const srcWet = ctx.createBufferSource();
    srcWet.buffer = audioBuffer;
    srcWet.playbackRate.value = pitch;

    const gainWet = ctx.createGain();
    gainWet.gain.value = Math.max(0, pitchMix);

    if (pitchShiftSt !== 0 && pitchMix > 0) {
      const pitchShifterNode = new PitchShift({ pitch: pitchShiftSt, wet: 1 });
      toneNodesRef.current.push(pitchShifterNode);
      toneConnect(srcWet, pitchShifterNode);
      toneConnect(pitchShifterNode, gainWet);
    } else {
      srcWet.connect(gainWet);
    }

    // ── Pre-effects merge ─────────────────────────────────────────────────────
    const preEffects = ctx.createGain();
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
