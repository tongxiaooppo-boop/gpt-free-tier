import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DEFAULT_TIER, GROUP_LABEL, type ModelGroup } from "../config/models";
import { NOTICES, NOTICE_VERSION, type NoticeLink } from "../config/notices";
import { SETUP_STEPS } from "../config/setupSteps";
import { readDay, setExternalUsed } from "../quota/store";
import { groupLimit, groupUsedBefore, type DayState } from "../quota/plan";
import md from "../../docs/openai-sharing.zh-TW.md?raw";
import { clearAll, loadSettings, saveSettings, type Settings } from "./storage";

import { CARDS, CATEGORIES, type Card } from "../config/cards";
import CardPage from "./CardPage";
import HistoryPage from "./HistoryPage";
import WherePage from "./WherePage";
import type { Conversation } from "./history";
type Page = "consent" | "setup" | "settings" | "doc" | "home" | "card" | "history" | "where";
const groups: ModelGroup[] = ["large", "small"];
export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href} {...(href?.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>,
    img: ({ alt }) => <span>{alt}</span>,
  }}>{children}</ReactMarkdown>;
}
function Links({ links }: { links?: readonly NoticeLink[] }) {
  return <div className="links">{links?.map(link => <a key={link.href} href={link.href}
    {...(link.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{link.label}</a>)}</div>;
}
export default function App() {
  const [settings, setSettings] = useState<Settings>({ apiKey: "", tier: DEFAULT_TIER, ackVersion: "" });
  const [page, setPage] = useState<Page>("consent");
  const [pendingShare, setPendingShare] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    if (!["title", "text", "url"].some(key => params.has(key))) return null;
    return ["title", "text", "url"].map(key => params.get(key)?.trim()).filter(Boolean).join("\n\n");
  });
  const [sharedText, setSharedText] = useState("");
  function clearShare() {
    const url = new URL(location.href);
    for (const key of ["title", "text", "url"]) url.searchParams.delete(key);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    setPendingShare(null);
  }
  const [card, setCard] = useState<Card>();
  const [selectedConversation, setSelectedConversation] = useState<Conversation>();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [day, setDay] = useState<DayState>();
  const [keyDraft, setKeyDraft] = useState("");
  const [external, setExternal] = useState<Record<ModelGroup, string>>({ small: "0", large: "0" });
  const gate = (s: Settings): Page => s.ackVersion !== NOTICE_VERSION ? "consent" : !s.apiKey ? "setup" : "home";
  const refreshQuota = async () => { try { setDay(await readDay(Date.now())); } catch (e) { setError(String(e)); } };
  useEffect(() => {
    let active = true;
    loadSettings().then(s => {
      if (!active) return;
      setSettings(s); setKeyDraft(s.apiKey); setPage(location.hash === "#doc/openai-sharing" ? "doc" : gate(s)); setReady(true);
    }).catch(e => setError(String(e)));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const navigate = () => { if (!busy && location.hash === "#doc/openai-sharing") setPage("doc"); };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, [busy]);
  useEffect(() => {
    if (!ready) return;
    void refreshQuota();
    const timer = window.setInterval(() => { void refreshQuota(); }, 30_000);
    const visible = () => { if (!document.hidden) void refreshQuota(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [ready]);
  async function persist(next: Settings) {
    await saveSettings(next); setSettings(next);
  }
  function go(next: Page) {
    if (busy) return;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    setError(""); setPage(next === "home" ? gate(settings) : next);
  }
  const safe = (action: () => Promise<void>) => { setError(""); void action().catch(e => setError(e instanceof Error ? e.message : String(e))); };
  function notices(consent: boolean): ReactNode {
    return NOTICES.map(n => <article key={n.id} className="panel">
      <h2>{n.title}</h2><p>{n.body}</p><Links links={n.links} />
      {consent && n.mustAck && <label className="check"><input type="checkbox" checked={!!ack[n.id]} onChange={e => setAck({ ...ack, [n.id]: e.target.checked })} />我已閱讀並同意</label>}
    </article>);
  }
  return <>
    {!["consent", "setup", "doc"].includes(page) && <header className="app-header"><button disabled={busy} className="brand" onClick={() => go("home")}>Free Tier Chat</button>
      <nav aria-label="主要分頁">{([['home', '首頁', '⌂'], ['history', '紀錄', '▤'], ['settings', '設定', '⚙']] as const).map(([target, label, icon]) => <button key={target} disabled={busy} aria-current={page === target || (target === "home" && (page === "card" || page === "where")) ? "page" : undefined} onClick={() => { if (target === "settings") { setKeyDraft(settings.apiKey); if (day) setExternal({ small: String(day.externalUsed.small), large: String(day.externalUsed.large) }); } go(target); }}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
    </header>}
    <main>
      {error && <div role="alert" className="error">{error}</div>}
      {!ready ? <p>正在讀取本機設定…</p> : <>
        {page === "consent" && <><h1>開始前，請先閱讀</h1>{notices(true)}<button className="primary" disabled={!NOTICES.filter(n => n.mustAck).every(n => ack[n.id])} onClick={() => safe(async () => { const next = { ...settings, ackVersion: NOTICE_VERSION }; await persist(next); setPage(gate(next)); })}>同意並繼續</button><button disabled={busy} onClick={() => go("setup")}>先看設定教學</button></>}
        {page === "setup" && <><h1>設定教學</h1>{SETUP_STEPS.map(s => <article className="panel" key={s.id}><h2>{s.title}</h2><p className="muted">{s.where}</p><ol>{s.steps.map((text, i) => <li key={i}>{text}</li>)}</ol>{s.warn && <p className="warning">{s.warn}</p>}<Links links={s.links} /></article>)}<button className="primary" onClick={() => go(settings.ackVersion === NOTICE_VERSION ? "settings" : "consent")}>前往{settings.ackVersion === NOTICE_VERSION ? "金鑰設定" : "同意頁"}</button></>}
        {page === "doc" && <><button onClick={() => go(gate(settings))}>返回</button><article className="panel markdown"><Markdown>{md}</Markdown></article></>}
        {page === "settings" && <><h1>設定</h1><button onClick={() => go("setup")}>設定教學</button><section className="panel">
          <label>API 金鑰<input type="password" autoComplete="off" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} /></label>
          <button onClick={() => safe(async () => { const next = { ...settings, apiKey: keyDraft.trim() }; await persist(next); setPage(gate(next)); })}>儲存金鑰</button>
          <button onClick={() => safe(async () => { await persist({ ...settings, apiKey: "" }); setKeyDraft(""); go("setup"); })}>刪除金鑰</button>
          <label>方案<select value={settings.tier} onChange={e => { const tier = e.target.value as Settings["tier"]; if (tier === "launch_grow" && !window.confirm("確定帳號方案是 Launch／Grow？選錯可能超額付費。")) return; safe(() => persist({ ...settings, tier })); }}><option value="build">Build</option><option value="launch_grow">Launch／Grow</option></select></label>
        </section><section className="panel"><h2>今天在其他地方已用量</h2>
          {groups.map(g => <label key={g}>{GROUP_LABEL[g]}（tokens）<input type="number" min="0" step="1" value={external[g]} onChange={e => setExternal({ ...external, [g]: e.target.value })} /></label>)}
          <button onClick={() => safe(async () => { for (const g of groups) { const value = Number(external[g]); if (!Number.isSafeInteger(value) || value < 0) throw new Error("用量請填 0 或正整數"); } for (const g of groups) await setExternalUsed(g, Number(external[g]), Date.now()); await refreshQuota(); })}>儲存今日用量</button>
        </section><h2>使用告知</h2>{notices(false)}<button className="danger" onClick={() => { if (window.confirm("清除全部本機資料？金鑰、對話、卡片結果與本機額度紀錄都會刪除。")) safe(async () => { await clearAll(); clearShare(); setSharedText(""); const next = { apiKey: "", tier: DEFAULT_TIER, ackVersion: "" }; setSettings(next); setKeyDraft(""); setAck({}); setDay(undefined); go("consent"); await refreshQuota(); }); }}>清除全部本機資料</button></>}
        {page === "home" && <div className="home-layout"><h1>今天想做什麼？</h1><aside className="home-aside"><section className="panel quota" aria-live="polite"><h2>今天的免費額度還剩</h2><div className="quota-groups">{groups.map(g => { const limit = groupLimit(settings.tier, g); const used = day ? groupUsedBefore(day, g) : 0; return <div className="quota-group" key={g}><span>{GROUP_LABEL[g]}</span><strong>{day ? Math.max(0, Math.round((1 - used / limit) * 100)) + "%" : "—"}</strong><small className="desktop-usage">已用 {used.toLocaleString()}／上限 {limit.toLocaleString()}</small></div>; })}</div><small>每天早上 8 點（台灣）重新計算</small></section><div className="warning">提醒：無法上網查資料，內容會分享給 OpenAI，請勿輸入私密資訊。</div></aside><div className="home-categories">
          {pendingShare !== null && <section className="panel"><h2>選擇要用的卡片</h2><p>分享內容會填入卡片，確認後再送出。</p><button onClick={clearShare}>取消分享</button></section>}
          {CATEGORIES.map(category => { const cards = CARDS.filter(c => category.id === c.category && (pendingShare === null || c.shareTargetField)); return cards.length > 0 && <section className="category" key={category.id}><h2>{category.label}</h2><div className="cards">{cards.map(c => <button className="card-button" key={c.id} onClick={() => { setSelectedConversation(undefined); setSharedText(pendingShare ?? ""); if (pendingShare !== null) clearShare(); setCard(c); go("card"); }}><span className="badge">{c.badge}</span><span><strong>{c.title}</strong><small>{c.tagline}</small></span></button>)}</div></section>; })}
          {pendingShare === null && <section className="category"><h2>生活工具</h2><div className="cards"><button className="card-button" onClick={() => go("where")}><span className="badge">放</span><span><strong>東西放哪</strong><small>記下東西放哪，忘了問它</small></span></button></div></section>}</div></div>}
        {page === "where" && <><button disabled={busy} onClick={() => go("home")}>返回</button><WherePage settings={settings} onBusy={setBusy} onQuota={refreshQuota} /></>}
        {page === "history" && <HistoryPage onOpen={conv => { const target = CARDS.find(c => c.id === conv.cardId); if (!target) { setError("找不到這筆紀錄的卡片"); return; } setSelectedConversation(conv); setSharedText(""); setCard(target); go("card"); }} />}
        {page === "card" && card && <><button disabled={busy} onClick={() => go("home")}>返回</button><CardPage key={card.id + (selectedConversation?.id ?? "")} card={card} initialConversation={selectedConversation} settings={settings} onBusy={setBusy} onQuota={refreshQuota} sharedText={sharedText} /></>}
      </>}
    </main>
  </>;
}
