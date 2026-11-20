import { useEffect, useRef, useState, type FormEvent } from "react";
import { QuotaRefusedError, streamChat } from "../api/openai";
import { describeError } from "../api/errors";
import { WHERE_AI_CONFIRM } from "../config/notices";
import { answerLine, applySave, findSameItem, localAnswer, localConfident, localFind, saveNote, splitLocal, WHERE_MAX, WHERE_NAME_MAX, WHERE_TEXT_MAX, type WhereItem } from "../where/rules";
import { findUserMessage, parseSplitReply, splitUserMessage, WHERE_AI_EFFORT, WHERE_AI_MODEL, WHERE_FIND_INSTRUCTIONS, WHERE_FIND_MAX_OUTPUT, WHERE_SPLIT_INSTRUCTIONS, WHERE_SPLIT_MAX_OUTPUT } from "../where/ai";
import { deleteWhereItem, loadWhereItems, saveWhereItems } from "../where/store";
import { Markdown } from "./App";
import type { Settings } from "./storage";
import { Microphone, ReadAloud, VoiceProvider } from "./Voice";

function displayTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const day = (value: Date) => value.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
  return day(now) === day(date)
    ? "今天 " + date.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
}
export default function WherePage({ settings, onBusy, onQuota }: {
  settings: Settings; onBusy: (busy: boolean) => void; onQuota: () => Promise<void>;
}) {
  const [items, setItems] = useState<WhereItem[]>();
  const [raw, setRaw] = useState("");
  const [question, setQuestion] = useState("");
  const [draft, setDraft] = useState<{ name: string; location: string; raw: string }>();
  const [splitPending, setSplitPending] = useState<string>();
  const [findPending, setFindPending] = useState<{ question: string; items: WhereItem[] }>();
  const [answer, setAnswer] = useState("");
  const [source, setSource] = useState<"local" | "ai">();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const controller = useRef<AbortController>();
  useEffect(() => {
    let mounted = true;
    loadWhereItems().then(all => { if (mounted) setItems(all); }).catch(error => { if (mounted) setError("本機讀取失敗：" + String(error)); });
    return () => { mounted = false; controller.current?.abort(); };
  }, []);
  const locked = busy || saving || !items;
  function changeRaw(value: string) { setRaw(value); setDraft(undefined); setSplitPending(undefined); }
  function changeQuestion(value: string) { setQuestion(value); setAnswer(""); setSource(undefined); setFindPending(undefined); }
  function organize(event: FormEvent) {
    event.preventDefault();
    if (active.current || !items) return;
    setError(""); setStatus(""); setNote("");
    if (!raw.trim()) { setError("請先輸入要記的東西和位置"); return; }
    if (raw.length > WHERE_TEXT_MAX) { setError(`這句話超過 ${WHERE_TEXT_MAX} 字，請先刪減。`); return; }
    const result = splitLocal(raw);
    setDraft(result ? { ...result, raw } : undefined);
    setSplitPending(result ? undefined : raw);
  }
  function find(event: FormEvent) {
    event.preventDefault();
    if (active.current || !items) return;
    setError(""); setStatus(""); setAnswer(""); setSource(undefined); setFindPending(undefined);
    if (!question.trim()) { setError("請先輸入要找什麼"); return; }
    if (question.length > WHERE_TEXT_MAX) { setError(`問題超過 ${WHERE_TEXT_MAX} 字，請先刪減。`); return; }
    if (!items.length) { setAnswer("還沒有記錄任何東西"); return; }
    if (localConfident(question, items)) { setAnswer(localAnswer(question, items)); setSource("local"); }
    else setFindPending({ question, items: [...items] });
  }
  async function runAI(kind: "split" | "find") {
    if (active.current || !items) return;
    const sentence = splitPending;
    const search = findPending;
    if (kind === "split" ? sentence === undefined : !search) return;
    active.current = true; setBusy(true); onBusy(true); setError(""); setStatus("");
    const current = new AbortController(); controller.current = current;
    if (kind === "split") setSplitPending(undefined);
    else { setFindPending(undefined); setAnswer(""); setSource("ai"); }
    try {
      const response = await streamChat({
        apiKey: settings.apiKey, tier: settings.tier, model: WHERE_AI_MODEL, reasoningEffort: WHERE_AI_EFFORT,
        instructions: kind === "split" ? WHERE_SPLIT_INSTRUCTIONS : WHERE_FIND_INSTRUCTIONS,
        messages: [{ role: "user", content: kind === "split" ? splitUserMessage(sentence!) : findUserMessage(search!.question, search!.items) }],
        maxOutputTokens: kind === "split" ? WHERE_SPLIT_MAX_OUTPUT : WHERE_FIND_MAX_OUTPUT,
      }, delta => { if (kind === "find") setAnswer(previous => previous + delta); }, current.signal);
      if (current.signal.aborted) return;
      if (kind === "split") {
        const parsed = parseSplitReply(response.text);
        setDraft({ ...(parsed ?? { name: "", location: "" }), raw: sentence! });
        if (!parsed) setError("AI 沒有看懂，請自己填");
      } else setAnswer(response.text);
      setStatus(response.incompleteReason === "max_output_tokens" ? "回答太長被截斷（已達輸出上限）" : response.incompleteReason ? "回答未完成：" + response.incompleteReason : "完成");
    } catch (error) {
      if (current.signal.aborted) setStatus("已停止；未取得完整用量時會以保留量計入。");
      else if (error instanceof QuotaRefusedError) setError("小模型組額度不足：已用 " + error.usedBefore.toLocaleString() + "／上限 " + error.limit.toLocaleString() + "，剩餘 " + Math.max(0, error.limit - error.usedBefore).toLocaleString() + " tokens");
      else setError(describeError(error, navigator.onLine).message);
    } finally {
      try { await onQuota(); }
      finally { controller.current = undefined; active.current = false; setBusy(false); onBusy(false); }
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (active.current || !items || !draft) return;
    active.current = true; setSaving(true); onBusy(true); setError("");
    try {
      const current = await loadWhereItems();
      const result = applySave(current, draft, Date.now(), crypto.randomUUID());
      await saveWhereItems(result.items);
      setItems([...result.items].sort((a, b) => b.updatedAt - a.updatedAt));
      setNote(saveNote(result, draft)); setRaw(""); setDraft(undefined); setSplitPending(undefined);
      setFindPending(undefined); setAnswer(""); setSource(undefined);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { active.current = false; setSaving(false); onBusy(false); }
  }
  async function remove(item: WhereItem) {
    if (active.current || !window.confirm(`確定刪除「${item.name}」？`)) return;
    active.current = true; setSaving(true); onBusy(true); setError("");
    try { await deleteWhereItem(item.id); setItems(await loadWhereItems()); setFindPending(undefined); setAnswer(""); setSource(undefined); }
    catch (error) { setError("本機刪除失敗：" + String(error)); }
    finally { active.current = false; setSaving(false); onBusy(false); }
  }
  const same = draft && items ? findSameItem(draft.name, items) : null;
  const eviction = draft?.name.trim() && items && items.length >= WHERE_MAX && !same
    ? applySave(items, { ...draft, location: draft.location.trim() || "（未填）" }, Date.now(), "preview").evicted : null;
  return <VoiceProvider>
    <h1>東西放哪</h1><p>只存在這台裝置，最多 {WHERE_MAX} 筆</p><p>{items ? `${items.length}／${WHERE_MAX} 筆` : "正在讀取…"}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {busy && <button type="button" onClick={() => controller.current?.abort()}>停止</button>}
    <p role="status">{busy ? "正在請 AI 處理…" : saving ? "正在儲存…" : status}</p>
    <div className="where-layout"><section className="panel"><h2>記一筆</h2>
      <form onSubmit={organize}><label htmlFor="where-raw">東西放在哪裡</label><textarea id="where-raw" value={raw} maxLength={WHERE_TEXT_MAX} disabled={locked} placeholder="例：健保卡放在客廳電視櫃第二層" onChange={event => changeRaw(event.target.value)} />
        <Microphone value={raw} onValue={changeRaw} onError={setError} disabled={locked} /><small>{raw.length}／{WHERE_TEXT_MAX} 字</small><button type="submit" disabled={locked}>整理</button>
      </form>
      {splitPending !== undefined && <div className="warning"><p>{WHERE_AI_CONFIRM.replace("{what}", "這句話")}</p><button disabled={locked} onClick={() => void runAI("split")}>送給 AI 整理</button><button disabled={locked} onClick={() => { setDraft({ name: "", location: "", raw: splitPending }); setSplitPending(undefined); }}>自己填</button></div>}
      {draft && <form className="where-confirm" onSubmit={save}><h2>確認要記的內容</h2>
        {same ? <p className="warning">「{same.name}」之前記在「{same.location}」，儲存後會改成新位置。</p> : eviction && <p className="warning">已經記滿 {WHERE_MAX} 筆，儲存後會刪掉最久沒更新的「{eviction.name}」。</p>}
        <label htmlFor="where-name">東西</label><input id="where-name" value={draft.name} maxLength={WHERE_NAME_MAX} disabled={locked} onChange={event => setDraft({ ...draft, name: event.target.value })} />
        <label htmlFor="where-location">位置</label><input id="where-location" value={draft.location} disabled={locked} onChange={event => setDraft({ ...draft, location: event.target.value })} />
        <button type="submit" disabled={locked}>儲存</button><button type="button" disabled={locked} onClick={() => setDraft(undefined)}>取消</button>
      </form>}
      {note && <div className="where-note"><p role="status">{note}</p><ReadAloud text={note} disabled={busy} /></div>}
    </section><section className="panel"><h2>找東西</h2>
      <form onSubmit={find}><label htmlFor="where-question">想找什麼</label><input id="where-question" value={question} maxLength={WHERE_TEXT_MAX} disabled={locked} onChange={event => changeQuestion(event.target.value)} />
        <Microphone value={question} onValue={changeQuestion} onError={setError} disabled={locked} /><small>{question.length}／{WHERE_TEXT_MAX} 字</small><button type="submit" disabled={locked}>找</button>
      </form>
      {items?.length === 0 && <p>還沒有記錄任何東西</p>}
      {findPending && <div className="warning"><p>{WHERE_AI_CONFIRM.replace("{what}", `清單裡 ${findPending.items.length} 筆的名稱與位置和你的問題`)}</p>
        {localFind(findPending.question, findPending.items).length > 0 && <><h3>本機可能的結果</h3><ul>{localFind(findPending.question, findPending.items).slice(0, 3).map(hit => <li key={hit.item.id}>{answerLine(hit.item)}</li>)}</ul></>}
        <button disabled={locked} onClick={() => void runAI("find")}>送給 AI 找</button><button disabled={locked} onClick={() => setFindPending(undefined)}>不用了</button>
      </div>}
      {answer && <div className="where-answer"><Markdown>{answer}</Markdown><ReadAloud text={answer} disabled={busy} /></div>}
      {source && <small>{source === "local" ? "本機找到，沒有用到 AI" : "AI 回答，請以實際位置為準"}</small>}
    </section></div>
    <section><h2>清單</h2><div className="history-list">{items?.map(item => <article className="history-row where-row" key={item.id}>
      <div className="history-title"><strong>{item.name}</strong><span>{item.location}</span><time dateTime={new Date(item.updatedAt).toISOString()}>{displayTime(item.updatedAt)}</time></div>
      <button className="danger" disabled={locked} aria-label={`刪除「${item.name}」`} onClick={() => void remove(item)}>刪除</button>
    </article>)}</div></section>
  </VoiceProvider>;
}
