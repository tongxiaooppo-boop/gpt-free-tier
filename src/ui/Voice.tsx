import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { VOICE_NOTICE } from "../config/notices";
import { appendDictation, dictationSupported, speak, speechSupported, startDictation, stopSpeaking, type Dictation } from "../voice/speech";

const VoiceContext = createContext<{ active?: string; start: (id: string, onText: (text: string) => void, onError: (message: string) => void) => void; stop: () => void; ids: string[]; register: (id: string) => () => void } | null>(null);
export function VoiceProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string>();
  const [ids, setIds] = useState<string[]>([]);
  const recording = useRef<Dictation>();
  const session = useRef(0);
  const stop = () => { session.current++; recording.current?.stop(); recording.current = undefined; setActive(undefined); };
  useEffect(() => () => { session.current++; recording.current?.stop(); stopSpeaking(); }, []);
  return <VoiceContext.Provider value={{ active, ids, stop,
    register: id => { setIds(previous => [...previous, id]); return () => setIds(previous => previous.filter(value => value !== id)); },
    start: (id, onText, onError) => {
      stop(); stopSpeaking();
      const token = ++session.current;
      setActive(id);
      try {
        const next = startDictation({ onText: text => { if (session.current === token) onText(text); }, onError,
          onEnd: () => { if (session.current === token) { recording.current = undefined; setActive(undefined); } } });
        if (session.current === token) recording.current = next;
      } catch (error) { setActive(undefined); onError(error instanceof Error ? error.message : String(error)); }
    }
  }}>{children}</VoiceContext.Provider>;
}
export function Microphone({ value, onValue, onError, disabled }: { value: string; onValue: (text: string) => void; onError: (message: string) => void; disabled: boolean }) {
  const voice = useContext(VoiceContext)!;
  const id = useId();
  const latestVoice = useRef(voice);
  latestVoice.current = voice;
  const latest = useRef({ value, onValue, onError });
  latest.current = { value, onValue, onError };
  const supported = dictationSupported();
  useEffect(() => { if (supported) return voice.register(id); }, [id, supported]);
  useEffect(() => { if (disabled && voice.active === id) voice.stop(); }, [disabled, voice.active]);
  useEffect(() => () => { if (latestVoice.current.active === id) latestVoice.current.stop(); }, [id]);
  if (!supported) return null;
  const listening = voice.active === id;
  return <div className="voice-input"><button type="button" disabled={disabled} aria-label={listening ? "停止語音輸入" : "語音輸入"} aria-pressed={listening} onClick={() => {
    if (listening) voice.stop();
    else voice.start(id, text => { const next = appendDictation(latest.current.value, text); latest.current.value = next; latest.current.onValue(next); }, message => latest.current.onError(message));
  }}>{listening ? "停止" : "麥克風"}</button>{voice.ids[0] === id && <small className="voice-notice">{VOICE_NOTICE}</small>}</div>;
}
export function ReadAloud({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const [reading, setReading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (disabled && reading) stopSpeaking(); }, [disabled, reading]);
  if (!speechSupported()) return null;
  return <button type="button" disabled={disabled || !text.trim()} onClick={() => {
    if (reading) stopSpeaking();
    else { stopSpeaking(); setReading(true); speak(text, () => { if (mounted.current) setReading(false); }); }
  }}>{reading ? "停止朗讀" : "朗讀"}</button>;
}
