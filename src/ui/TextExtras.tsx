import { useRef, useState } from "react";
import { foldText, textStats } from "../text/stats";
import { decodeTextBytes, isAcceptedTextFile, MAX_TEXT_FILE_BYTES } from "../text/fileText";

export function FoldedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const folded = foldText(text);
  return <div className="user-text">{folded.folded && !expanded ? folded.preview : text}{folded.folded && <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : `展開全文（共 ${folded.chars} 字）`}</button>}</div>;
}

export function TextExtras({ value, maxChars, disabled, onValue, onError, onLoading }: {
  value: string; maxChars?: number; disabled: boolean; onValue: (text: string) => void; onError: (message: string) => void; onLoading: (loading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const stats = textStats(value);
  async function read(file: File) {
    onError("");
    if (!isAcceptedTextFile(file.name)) { onError("只能讀入 .txt 或 .md 檔"); return; }
    if (file.size > MAX_TEXT_FILE_BYTES) { onError("檔案太大（上限 1 MB）"); return; }
    onLoading(true);
    try {
      const text = decodeTextBytes(new Uint8Array(await file.arrayBuffer()));
      if (maxChars !== undefined && text.length > maxChars) { onError(`檔案有 ${text.length} 字，超過這欄上限 ${maxChars} 字，請先刪減。`); return; }
      if (value && !confirm("要用檔案內容取代目前的文字嗎？")) return;
      onValue(text);
    } catch (error) { onError(error instanceof Error ? error.message : String(error)); }
    finally { onLoading(false); }
  }
  return <div className="text-extras"><small>{stats.chars}{maxChars === undefined ? "" : ` / ${maxChars}`} 字・約 {stats.tokens} tokens</small><button type="button" disabled={disabled} onClick={() => input.current?.click()}>讀入 .txt／.md</button><input ref={input} type="file" hidden accept=".txt,.md,.markdown,text/plain,text/markdown" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void read(file); }} /></div>;
}
