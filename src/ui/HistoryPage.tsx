import { useEffect, useState } from "react";
import { CARDS } from "../config/cards";
import { deleteConversation, listConversations, loadConversation, type Conversation } from "./history";

function displayTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const day = (value: Date) => value.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
  return day(now) === day(date)
    ? date.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
}
export default function HistoryPage({ onOpen }: { onOpen: (conv: Conversation) => void }) {
  const [records, setRecords] = useState<Conversation[]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { let active = true; listConversations().then(all => { if (active) setRecords(all); }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, []);
  async function open(id: string) {
    setLoading(true); setError("");
    try { const conv = await loadConversation(id); if (conv) onOpen(conv); else { setRecords(await listConversations()); setError("這筆紀錄已刪除"); } }
    catch (e) { setError(String(e)); } finally { setLoading(false); }
  }
  async function remove(conv: Conversation) {
    if (!window.confirm("確定刪除這筆對話紀錄？")) return;
    setLoading(true); setError("");
    try { await deleteConversation(conv.id); setRecords(await listConversations()); } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }
  return <><h1>紀錄</h1><p className="muted">開啟以前的回答，或接著聊。</p>{error && <p className="error" role="alert">{error}</p>}
    {!records ? <p>正在讀取紀錄…</p> : records.length === 0 ? <section className="panel">還沒有對話紀錄，選一張卡片開始吧。</section> : <div className="history-list">{records.map(conv => { const card = CARDS.find(c => c.id === conv.cardId); return <article className="history-row" key={conv.id}><button className="history-open" disabled={loading} onClick={() => void open(conv.id)}><span className="badge">{card?.badge ?? "談"}</span><span className="history-title"><strong>{conv.title || card?.title || "對話"}</strong><small>{card?.title ?? "未知卡片"}</small></span><time dateTime={new Date(conv.updatedAt).toISOString()}>{displayTime(conv.updatedAt)}</time></button><button disabled={loading} className="danger" aria-label={"刪除「" + (conv.title || card?.title || "對話") + "」"} onClick={() => void remove(conv)}>刪除</button></article>; })}</div>}
  </>;
}
