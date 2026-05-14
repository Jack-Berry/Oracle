import { useState, useRef, useCallback, useEffect } from "react";

const Recognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const isSpeechRecognitionSupported = !!Recognition;

/**
 * Push-to-talk speech recognition.
 * Call start(onFinalResult) to begin; call stop() to end.
 * onFinalResult fires for each finalised speech chunk so the caller can
 * append text incrementally. interimText holds the in-progress fragment.
 *
 * Swap point for phase 3: replace with a backend transcription endpoint
 * (Whisper etc.) by keeping the same start/stop/interimText/error surface.
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState(null);
  const ref = useRef(null);

  const start = useCallback((onFinalResult) => {
    if (!Recognition || ref.current) return;

    const r = new Recognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          onFinalResult?.(e.results[i][0].transcript);
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    r.onerror = (e) => {
      // 'no-speech' is benign — user just didn't say anything before releasing
      if (e.error !== "no-speech") setError(e.error);
      setIsListening(false);
      setInterimText("");
      ref.current = null;
    };

    r.onend = () => {
      setIsListening(false);
      setInterimText("");
      ref.current = null;
    };

    r.start();
    ref.current = r;
    setIsListening(true);
    setError(null);
  }, []);

  // stop() finalises any pending result; abort() discards it
  const stop = useCallback(() => {
    ref.current?.stop();
  }, []);

  useEffect(
    () => () => {
      ref.current?.stop();
    },
    [],
  );

  return {
    isSupported: isSpeechRecognitionSupported,
    isListening,
    interimText,
    error,
    start,
    stop,
  };
}
