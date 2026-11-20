import { useEffect, useRef, useState, type FormEvent } from "react";
import { Microphone, ReadAloud, VoiceProvider } from "./Voice";
import { type Card, renderCard, validateCard } from "../config/cards";
import { GROUP_LABEL, modelGroupOf, selectableModels } from "../config/models";
import { QuotaRefusedError, streamChat, type ChatMessage, type AnswerMeta } from "../api/openai";
import { describeError } from "../api/errors";
import { conversationToMarkdown, exportFileName, formatMeta } from "../text/export";
import { editUserMessage } from "../text/thread";
import { detectPII, maskPII, scanFields, maskFields, PII_LABEL, PII_NAME_HINT } from "../text/pii";
import { FoldedText, TextExtras } from "./TextExtras";
import type { Settings } from "./storage";
import { newConversationId, saveConversation, titleFrom, type Conversation } from "./history";
import { Markdown } from "./App";

async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("請選擇圖片檔案");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("圖片無法讀取，請改用 JPEG 或 PNG")); image.src = url; });
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器無法處理圖片");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}
export default function CardPage({ card, settings, onBusy, onQuota, sharedText, initialConversation }: {
  card: Card; settings: Settings; onBusy: (busy: boolean) => void; onQuota: () => Promise<void>; sharedText?: string; initialConversation?: Conversation;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(card.fields.map(f => [f.id, f.id === card.shareTargetField && sharedText ? sharedText : f.default ?? ""])));
  const [model, setModel] = useState(selectableModels().some(m => m.id === initialConversation?.model) ? initialConversation!.model : card.defaultModel);
  const [messages, setMessages] = useState<ChatMessage[]>(initialConversation?.messages ?? []);
  const [result, setResult] = useState(initialConversation?.messages.filter(m => m.role === "assistant").at(-1)?.content ?? "");
  const [resultModel, setResultModel] = useState(initialConversation?.model ?? card.defaultModel);
  const [resultMeta, setResultMeta] = useState<AnswerMeta | undefined>(initialConversation?.messages.filter(m => m.role === "assistant").at(-1)?.meta);
  const [retryable, setRetryable] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [editing, setEditing] = useState<{ index: number; content: string }>();
  const [pending, setPending] = useState<{ kind: "fields"; values: Record<string, string> } | { kind: "edit"; index: number; content: string }>();
  const piiDialog = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pending) piiDialog.current?.focus(); }, [pending]);
  const textFieldIds = card.fields.filter(field => field.kind === "textarea" || field.kind === "text").map(field => field.id);
  const conversation = useRef<Conversation | undefined>(initialConversation);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const controller = useRef<AbortController>();
  const requestActive = useRef(false);
  const lastRequest = useRef<{ messages: ChatMessage[]; instructions: string; model: string }>();
  useEffect(() => () => { controller.current?.abort(); }, []);
  async function run(repeat = false, editedMessages?: ChatMessage[], formValues = values) {
    if (requestActive.current || imageBusy || fileBusy) return;
    setError(""); setStatus(""); setRetryable(false);
    let request = editedMessages ? { messages: editedMessages, instructions: renderCard(card, formValues).instructions, model } : repeat ? lastRequest.current : undefined;
    if (!request) {
      const errors = validateCard(card, formValues);
      if (errors.length) { setError(errors.join("\n")); return; }
      const rendered = renderCard(card, formValues);
      const user: ChatMessage = { role: "user", content: rendered.user, ...(rendered.images.length ? { images: rendered.images } : {}) };
      request = { model, instructions: rendered.instructions, messages: card.multiTurn ? [...messages, user] : [user] };
    }
    setEditing(undefined);
    lastRequest.current = request;
    const current = new AbortController(); controller.current = current;
    requestActive.current = true; setBusy(true); onBusy(true); setResult("");
    const startedAt = Date.now();
    let meta: AnswerMeta = { model: request.model, ms: 0, usage: null, incompleteReason: null };
    setResultMeta(undefined);
    let text = "";
    let completed = false;
    setResultModel(request.model);
    try {
      const response = await streamChat({
        apiKey: settings.apiKey, tier: settings.tier, model: request.model, instructions: request.instructions,
        messages: request.messages, maxOutputTokens: card.maxOutputTokens, reasoningEffort: card.reasoningEffort,
      }, delta => { text += delta; setResult(text); }, current.signal);
      text = response.text; setResult(text);
      meta = { ...meta, usage: response.usage, incompleteReason: response.incompleteReason };
      completed = true;
      setStatus(response.incompleteReason === "max_output_tokens" ? "回答太長被截斷（已達輸出上限）" : response.incompleteReason ? "回答未完成：" + response.incompleteReason : "完成");
    } catch (e) {
      if (current.signal.aborted) { meta.incompleteReason = "已停止"; setStatus("已停止；未取得完整用量時會以保留量計入。"); }
      else if (e instanceof QuotaRefusedError) {
        const group = modelGroupOf(request.model);
        setError((group ? GROUP_LABEL[group] : "模型") + "額度不足：已用 " + e.usedBefore.toLocaleString() + "／上限 " + e.limit.toLocaleString() + "，剩餘 " + Math.max(0, e.limit - e.usedBefore).toLocaleString() + " tokens");
      } else {
        const info = describeError(e, navigator.onLine);
        meta.incompleteReason = info.message;
        setError(info.message); setRetryable(info.retryable);
      }
    } finally {
      meta.ms = Date.now() - startedAt;
      if (completed || current.signal.aborted || text.length > 0) {
        const nextMessages: ChatMessage[] = [...request.messages, { role: "assistant", content: text, meta }];
        setMessages(nextMessages); setResultMeta(meta);
        if (card.multiTurn) setValues(previous => Object.fromEntries(card.fields.map(field => [field.id, field.kind === "textarea" || field.kind === "image" ? "" : previous[field.id]])));
        const now = Date.now();
        const previous = card.multiTurn ? conversation.current : undefined;
        const record: Conversation = { id: previous?.id ?? newConversationId(), cardId: card.id, title: titleFrom(nextMessages.find(m => m.role === "user")?.content ?? ""), messages: nextMessages, model: request.model, createdAt: previous?.createdAt ?? now, updatedAt: now };
        conversation.current = record;
        try { await saveConversation(record); }
        catch (e) { setError(previous => [previous, "本機儲存失敗：" + String(e)].filter(Boolean).join("\n")); }
      }
      try { await onQuota(); }
      finally { requestActive.current = false; setBusy(false); onBusy(false); controller.current = undefined; }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (requestActive.current || imageBusy || fileBusy || pending) return;
    const errors = validateCard(card, values);
    setRetryable(false); setError("");
    if (errors.length) { setError(errors.join("\n")); return; }
    if (scanFields(values, textFieldIds).length) { setPending({ kind: "fields", values: { ...values } }); return; }
    void run();
  }
  function resend(index: number, content: string, confirmed = false) {
    if (requestActive.current || imageBusy || fileBusy) return;
    setError(""); setRetryable(false);
    try {
      const next = editUserMessage(messages, index, content);
      if (!confirmed && detectPII(content).length) { setPending({ kind: "edit", index, content }); return; }
      void run(false, next);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  function confirmPII(mask: boolean) {
    if (!pending) return;
    const request = pending;
    setPending(undefined);
    if (request.kind === "fields") {
      const next = mask ? maskFields(request.values, textFieldIds).values : request.values;
      setValues(next);
      void run(false, undefined, next);
    } else {
      const content = mask ? maskPII(request.content, detectPII(request.content)).text : request.content;
      resend(request.index, content, true);
    }
  }
  const piiPrompt = pending && <div ref={piiDialog} tabIndex={-1} className="pii-prompt" role="alertdialog" aria-labelledby="pii-title" aria-describedby="pii-hint">
    <h2 id="pii-title">送出前請確認：找到可能的個資</h2>
    <ul>{(pending.kind === "fields" ? scanFields(pending.values, textFieldIds) : detectPII(pending.content)).map((hit, index) => <li key={index}>{PII_LABEL[hit.type]}：{hit.text}</li>)}</ul>
    <p id="pii-hint">{PII_NAME_HINT}</p>
    <div className="actions"><button type="button" onClick={() => confirmPII(true)}>遮蔽後送出</button><button type="button" onClick={() => confirmPII(false)}>照原文送出</button><button type="button" onClick={() => setPending(undefined)}>返回修改</button></div>
  </div>;
  const labelOf = (id: string) => selectableModels().find(m => m.id === id)?.label ?? id;
  const modelLabel = labelOf(resultModel);
  function download() {
    const record = conversation.current;
    if (!record) return;
    const url = URL.createObjectURL(new Blob([conversationToMarkdown(record, card.title, labelOf)], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = exportFileName(record.title, Date.now());
    document.body.append(link);
    try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
  }
  const thread = <div className="chat-thread">{(busy ? lastRequest.current?.messages ?? messages : messages).map((message, index) => <div className="conversation" key={index}>
    <h2>{message.role === "user" ? "你" : "回答"}</h2>
    {message.role === "assistant" ? <><Markdown>{message.content}</Markdown>{card.footer && <p className="card-footer">{card.footer}</p>}<ReadAloud text={message.content} disabled={busy} /><small className="result-model">{message.meta ? formatMeta(message.meta, labelOf(message.meta.model)) : "使用 " + labelOf(conversation.current?.model ?? resultModel)}</small></> : editing?.index === index ? <div>
      <label htmlFor="edit-message">編輯訊息</label><textarea id="edit-message" value={editing.content} disabled={busy || fileBusy || !!pending} onChange={event => setEditing({ index, content: event.target.value })} />
      <Microphone value={editing.content} disabled={busy || imageBusy || fileBusy || !!pending} onValue={content => setEditing({ index, content })} onError={message => { setError(message); setRetryable(false); }} />
      <TextExtras value={editing.content} disabled={busy || imageBusy || fileBusy || !!pending} onValue={content => setEditing({ index, content })} onError={message => { setError(message); setRetryable(false); }} onLoading={setFileBusy} />
      {pending?.kind === "edit" && piiPrompt}
      <button disabled={busy || imageBusy || fileBusy || !!pending} onClick={() => resend(index, editing.content)}>重新送出</button><button disabled={busy || fileBusy || !!pending} onClick={() => setEditing(undefined)}>取消</button>
    </div> : <><FoldedText text={message.content} />{!busy && <button disabled={imageBusy || fileBusy || !!pending} onClick={() => { setEditing({ index, content: message.content }); setError(""); setRetryable(false); }}>編輯</button>}</>}
    {message.images?.map((image, j) => <img className="thumbnail" key={j} src={image} alt="對話附件" />)}
  </div>)}{busy && <div className="markdown"><Markdown>{result}</Markdown>{card.footer && <p className="card-footer">{card.footer}</p>}</div>}</div>;
  return <VoiceProvider>
    <h1>{card.title}</h1><p>{card.description}</p>
    <div className="links">{card.links?.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
    <div className={card.multiTurn ? "chat-page" : "card-layout"}>
    {card.multiTurn && <section className="panel">{thread}<button disabled={busy || imageBusy || fileBusy || !!pending} onClick={() => { conversation.current = undefined; setMessages([]); setEditing(undefined); setPending(undefined); setResult(""); setResultMeta(undefined); setRetryable(false); setStatus(""); setError(""); lastRequest.current = undefined; setValues(Object.fromEntries(card.fields.map(field => [field.id, field.default ?? ""]))); }}>開始新對話</button><button disabled={busy || !conversation.current} onClick={download}>匯出整段對話</button></section>}
    <form onSubmit={submit} className={"panel" + (card.multiTurn ? " chat-input" : "")}><fieldset disabled={busy || imageBusy || fileBusy || !!pending}>
      {card.fields.map((field, index) => <div key={field.id}>
        <label htmlFor={"field-" + field.id}><span className="step">第 {index + 1} 步</span>　{field.label}{field.required ? "（必填）" : ""}</label>
        {field.kind === "textarea" ? <textarea id={"field-" + field.id} value={values[field.id]} maxLength={field.maxChars} onChange={e => setValues({ ...values, [field.id]: e.target.value })} /> :
        field.kind === "select" ? <select id={"field-" + field.id} value={values[field.id]} onChange={e => setValues({ ...values, [field.id]: e.target.value })}>{field.options?.map(option => <option key={option}>{option}</option>)}</select> :
        field.kind === "image" ? <>
          <input id={"field-" + field.id} type="file" accept="image/*" capture="environment" onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            setImageBusy(true); setError("");
            void compressImage(file).then(data => setValues(previous => ({ ...previous, [field.id]: data }))).catch(e => setError(String(e))).finally(() => setImageBusy(false));
          }} />
          {values[field.id] && <><img className="thumbnail" src={values[field.id]} alt={field.label + "預覽"} /><button type="button" onClick={() => setValues({ ...values, [field.id]: "" })}>移除圖片</button></>}
        </> : <input id={"field-" + field.id} type="text" value={values[field.id]} maxLength={field.maxChars} onChange={e => setValues({ ...values, [field.id]: e.target.value })} />}
        {field.kind === "textarea" && <Microphone value={values[field.id] ?? ""} disabled={busy || imageBusy || fileBusy || !!pending} onValue={text => setValues(previous => ({ ...previous, [field.id]: text }))} onError={message => { setError(message); setRetryable(false); }} />}
        {field.kind === "textarea" && <TextExtras value={values[field.id] ?? ""} maxChars={field.maxChars} disabled={busy || imageBusy || fileBusy || !!pending} onValue={text => setValues(previous => ({ ...previous, [field.id]: text }))} onError={message => { setError(message); setRetryable(false); }} onLoading={setFileBusy} />}
      </div>)}
      <details><summary>進階：換模型</summary><label>模型<select value={model} onChange={e => setModel(e.target.value)}>{selectableModels().map(m => <option key={m.id} value={m.id}>{m.label} · {GROUP_LABEL[m.group]}</option>)}</select></label></details>
    </fieldset>{pending?.kind === "fields" && piiPrompt}<button type={busy ? "button" : "submit"} className="primary start-button" disabled={imageBusy || fileBusy || !!pending} onClick={busy ? () => controller.current?.abort() : undefined}>{busy ? "停止" : imageBusy ? "處理圖片中…" : "開始"}</button></form>
    <section className="panel result-panel"><h2>結果</h2>
      {!card.multiTurn && <>{initialConversation && messages.length > 0 && <div className="conversation"><h2>當時的輸入</h2>{messages.filter(m => m.role === "user").map((message, i) => <div key={i}><FoldedText text={message.content} />{message.images?.map((image, j) => <img className="thumbnail" key={j} src={image} alt="對話附件" />)}</div>)}</div>}<div className="markdown"><Markdown>{result}</Markdown></div>{(result || busy) && card.footer && <p className="card-footer">{card.footer}</p>}</>}
      <div className="actions"><button disabled={!result} onClick={() => { void navigator.clipboard.writeText(result).then(() => setStatus("已複製")).catch(e => setError("複製失敗：" + String(e))); }}>複製</button>{!card.multiTurn && <ReadAloud text={result} disabled={busy} />}{!card.multiTurn && <button disabled={busy || !conversation.current} onClick={download}>下載 .md</button>}<button disabled={busy || imageBusy || fileBusy || !!pending || !lastRequest.current} onClick={() => { void run(true); }}>再來一次</button></div>
      <small className="result-model">{!busy && resultMeta ? formatMeta(resultMeta, labelOf(resultMeta.model)) : "使用 " + modelLabel}</small><p role="status">{status || (busy ? "正在產生回答…" : imageBusy ? "正在處理圖片…" : "")}</p>
    </section></div>{error && <div className="error" role="alert">{error}{retryable && <button disabled={busy || imageBusy || fileBusy || !!pending || !lastRequest.current} onClick={() => { void run(true); }}>重試</button>}</div>}
  </VoiceProvider>;
}
