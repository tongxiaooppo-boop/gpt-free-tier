// 語音輸入與朗讀（第 5 輪）：只用瀏覽器內建 Web Speech API，不用 OpenAI 轉錄（不在免費額度內）。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。
//
// 告知：語音辨識由瀏覽器處理（Chrome 送 Google、Safari 送 Apple），文字見 config/notices.ts 的 VOICE_NOTICE。
// 瀏覽器不支援時畫面不顯示麥克風／朗讀按鈕（不顯示停用的按鈕，也不提示）。

export const DICTATION_LANG = "zh-TW";

/** window.SpeechRecognition 或 window.webkitSpeechRecognition 存在。 */
export function dictationSupported(): boolean {
  return !!recognitionConstructor();
}

export interface Dictation {
  /** 停止收音；之後仍會呼叫一次 onEnd */
  stop(): void;
}

/**
 * 開始一次收音：lang＝DICTATION_LANG、continuous＝false、interimResults＝false。
 * 每收到一段 final 結果呼叫 onText(該段文字)；出錯呼叫 onError(speechErrorMessage(event.error))，訊息是空字串時不呼叫；
 * 結束（含出錯後、stop 後）一定呼叫一次 onEnd。不支援時丟 Error「這個瀏覽器不支援語音輸入」。
 */
export function startDictation(opts: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): Dictation {
  const Constructor = recognitionConstructor();
  if (!Constructor) throw new Error("這個瀏覽器不支援語音輸入");
  const recognition = new Constructor();
  recognition.lang = DICTATION_LANG;
  recognition.continuous = false;
  recognition.interimResults = false;
  let ended = false;
  const finish = () => { if (!ended) { ended = true; opts.onEnd(); } };
  recognition.onresult = event => {
    if (ended) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) opts.onText(event.results[i][0].transcript);
    }
  };
  recognition.onerror = event => {
    try { const message = speechErrorMessage(event.error); if (message) opts.onError(message); }
    finally { finish(); }
  };
  recognition.onend = finish;
  try { recognition.start(); } catch (error) { finish(); throw error; }
  return { stop: () => recognition.stop() };
}

/** "speechSynthesis" in window 且 window.SpeechSynthesisUtterance 存在。 */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.SpeechSynthesisUtterance;
}

/** 先 cancel 正在念的，再用 textForSpeech(text) 念出來（lang＝DICTATION_LANG）；轉完是空字串就不念。onEnd 在念完或被取消時呼叫。 */
export function speak(text: string, onEnd?: () => void): void {
  stopSpeaking();
  const plain = textForSpeech(text);
  if (!speechSupported() || !plain) { onEnd?.(); return; }
  const utterance = new window.SpeechSynthesisUtterance(plain);
  utterance.lang = DICTATION_LANG;
  let ended = false;
  const finish = () => { if (!ended) { ended = true; if (finishSpeech === finish) finishSpeech = undefined; onEnd?.(); } };
  utterance.onend = finish;
  utterance.onerror = finish;
  finishSpeech = finish;
  try { window.speechSynthesis.speak(utterance); } catch (error) { finish(); throw error; }
}

/** speechSynthesis.cancel()；不支援時什麼都不做。 */
export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
  finishSpeech?.();
}

/**
 * 把 Markdown 回答轉成適合朗讀的純文字（純函式）：
 * 1. 程式碼區塊（``` 包住的整段）換成「（程式碼略）」；行內 `code` 去掉反引號保留內容。
 * 2. 連結 [文字](網址) 只留文字；圖片 ![說明](網址) 整個去掉。
 * 3. 每行開頭的 #、>、清單符號（-、*、+、「1.」這類數字加點）去掉。
 * 4. 表格：只由 |、-、:、空白組成的分隔行刪掉；其餘行去掉頭尾的 |，中間的 | 換成「，」。
 * 5. 粗體斜體符號 ** __ * _（成對包住文字的）去掉，保留文字。
 * 6. 每行去頭尾空白，連續空行壓成一個，整段去頭尾。
 */
export function textForSpeech(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?[\s\S]*?```/g, "（程式碼略）")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .split("\n")
    .filter(line => !/^\s*[|:\-\s]+$/.test(line) || !line.includes("|"))
    .map(line => line.replace(/^\s*(?:(?:#{1,6}|>|[-*+]|\d+\.)\s+)+/, "")
      .replace(/^\s*\||\|\s*$/g, "").replace(/\s*\|\s*/g, "，")
      .replace(/(\*\*|__|\*|_)(.+?)\1/g, "$2").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 把辨識結果接到欄位原有文字後面（純函式）：
 * current 去尾端空白後是空的 → 回傳 addition 去頭尾；
 * current 最後一個字與 addition 第一個字都是英數字 → 中間加一個半形空白；其他情況直接相接（中文不加空白）。
 * addition 去頭尾後是空的 → 回傳 current 原樣。
 */
export function appendDictation(current: string, addition: string): string {
  const next = addition.trim();
  if (!next) return current;
  const previous = current.trimEnd();
  if (!previous) return next;
  return previous + (/[a-z0-9]$/i.test(previous) && /^[a-z0-9]/i.test(next) ? " " : "") + next;
}

/**
 * SpeechRecognition 錯誤碼轉中文（純函式）：
 * not-allowed、service-not-allowed →「麥克風權限被拒，請到瀏覽器設定允許使用麥克風」
 * no-speech →「沒有聽到聲音，請再試一次」
 * audio-capture →「找不到麥克風」
 * network →「語音辨識需要網路連線」
 * aborted → ""（使用者自己停的，不顯示）
 * 其他 →「語音辨識出錯（{code}）」
 */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed": case "service-not-allowed": return "麥克風權限被拒，請到瀏覽器設定允許使用麥克風";
    case "no-speech": return "沒有聽到聲音，請再試一次";
    case "audio-capture": return "找不到麥克風";
    case "network": return "語音辨識需要網路連線";
    case "aborted": return "";
    default: return `語音辨識出錯（${code}）`;
  }
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
function recognitionConstructor(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
let finishSpeech: (() => void) | undefined;
