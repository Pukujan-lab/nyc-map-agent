import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal Web Speech API surface. The DOM lib does not ship these types
 * consistently, so they are declared locally and accessed defensively.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return (
    candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
  );
}

export interface UseSpeechOptions {
  onFinalTranscript: (text: string) => void;
}

export interface UseSpeechResult {
  sttSupported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  clearError: () => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  speaking: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export function useSpeech({
  onFinalTranscript,
}: UseSpeechOptions): UseSpeechResult {
  const [sttSupported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition isn't available in this browser.");
      return;
    }
    if (recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    finalRef.current = "";
    setInterim("");
    setError(null);

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) finalRef.current = `${finalRef.current} ${finalText}`.trim();
      setInterim(`${finalRef.current} ${interimText}`.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access is blocked — type your question instead.");
      } else if (event.error === "no-speech") {
        setError("I didn't catch that. Try again, a little closer to the mic.");
      } else if (event.error === "audio-capture") {
        setError("No microphone was found. You can still type your question.");
      } else {
        setError(`Speech recognition failed (${event.error}).`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
      const transcript = finalRef.current.trim();
      finalRef.current = "";
      if (transcript) callbackRef.current(transcript);
    };

    recognition.onstart = () => setListening(true);

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (muted) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.pitch = 1;
      const voices = synth.getVoices();
      const preferred =
        voices.find(
          (voice) =>
            voice.lang === "en-US" && /google|samantha|natural|aria/i.test(voice.name),
        ) ?? voices.find((voice) => voice.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [muted],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    sttSupported,
    listening,
    interim,
    error,
    clearError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    speaking,
    muted,
    setMuted,
  };
}
