// 「東西放哪」本機規則（第 5 輪）。純函式，不碰儲存、不呼叫 API。
// 框架與實作：Opus 2026-11-19，移植自作者的 where 專案 where-ai.html（sameThing、parseDescription、stripFiller、
// findKeywords、localFind、localConfident、answerLine），改寫成 TS 並精簡成只有「名稱＋位置＋原話」。
// 不搬 where 的地點階層（主地點／子地點）與分類；「某地方有什麼」改用位置字串包含判斷（placeHits）。
// 實作者不得改本檔；覺得規則有問題就停下回報。

export const WHERE_MAX = 100;
export const WHERE_NAME_MAX = 20;
export const WHERE_TEXT_MAX = 200;

export interface WhereItem {
  id: string;
  /** 東西名稱，最多 WHERE_NAME_MAX 字 */
  name: string;
  /** 位置原話（例「客廳電視櫃第二層」），不可為空 */
  location: string;
  /** 使用者當初說的整句話（可為空字串） */
  raw: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 同一個東西：去頭尾後相同；或短的至少 2 字、長的包含短的、且長度比 ≥ 0.6。
 * 「血壓計」對得上「血壓計啊」，對不上「血壓計的盒子」，也不會把「眼鏡」併進「老花眼鏡」。單字名稱須完全相同。
 */
export function sameThing(a: string, b: string): boolean {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const long = x.length >= y.length ? x : y;
  const short = x.length >= y.length ? y : x;
  if (short.length < 2) return false;
  return long.includes(short) && short.length / long.length >= 0.6;
}

/** 從最近更新的往回找第一筆同名的東西。 */
export function findSameItem(name: string, items: readonly WhereItem[]): WhereItem | null {
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted.find((it) => sameThing(it.name, name)) ?? null;
}

const LOCATION_PREFIXES = ["放在", "放到", "放進", "放了", "放於", "收在", "收到", "收進", "收了",
  "藏在", "擺在", "擺到", "擺了", "置於", "擱在", "丟在", "掛在", "在"];
const NAME_LEAD = /^(幫我記一下|幫我記|記一下|我要記|我想記|剛剛|剛才|今天|昨天|早上|中午|下午|晚上|我把|我有|我的|我用|我拿|那個|這個|就是|然後|順手|順便|已經|放好|收好|拿了|買了|帶了|用了|啊|欸|嗯|我|把|將|拿|買|帶)/;
const TAIL_SOFT = /(啊|阿|啦|喔|唷|耶|呢|嘛|我|了|的)$/;
const TAIL_HARD = /(放|收|藏|擺|置|拿|丟|掛|把|將|就)$/;
const QTY_UNIT = "[0-9一二三四五六七八九十兩]+\\s*(?:個|條|支|瓶|盒|包|罐|顆|片|張|把|組|台|隻|本|副|袋|捲)";
const SENTENCE_END = /[，,。.！!？?；;、]/;

/** 剝掉口語贅詞（反覆剝到剝不動，最多 8 次）。 */
export function stripFiller(text: string): string {
  let t = String(text || "").trim();
  for (let i = 0; i < 8; i++) {
    const before = t;
    let n: string;
    n = t.replace(NAME_LEAD, "").trim(); if (n) t = n;
    n = t.replace(new RegExp("^" + QTY_UNIT), "").trim(); if (n) t = n;
    n = t.replace(new RegExp(QTY_UNIT + "$"), "").trim(); if (n) t = n;
    n = t.replace(TAIL_SOFT, "").trim(); if (n) t = n;
    n = t.replace(TAIL_HARD, "").trim(); if (n.length >= 2) t = n;
    if (t === before) break;
  }
  return t;
}

/**
 * 本機拆「東西／位置」：找最長的位置片段（位置用語之後到第一個標點，至少 2 字），名稱切在位置用語前並剝贅詞。
 * 找不到位置、或剝完名稱是空的 → null（畫面改問 AI 或讓使用者自己填）。
 * 例：「鑰匙放在客廳的鞋櫃上面」→ { name: "鑰匙", location: "客廳的鞋櫃上面" }。
 */
export function splitLocal(text: string): { name: string; location: string } | null {
  const s = String(text || "").trim();
  let location = "";
  let cutAt = -1;
  for (const prefix of LOCATION_PREFIXES) {
    const idx = s.indexOf(prefix);
    if (idx !== -1) {
      const loc = s.slice(idx + prefix.length).split(SENTENCE_END)[0].trim();
      if (loc.length >= 2 && loc.length > location.length) { location = loc; cutAt = idx; }
    }
  }
  if (cutAt < 0) return null;
  const name = stripFiller(s.slice(0, cutAt)).slice(0, WHERE_NAME_MAX);
  if (!name) return null;
  return { name, location };
}

const FIND_STOP = ["放在哪裡", "放在哪", "在哪裡", "在哪邊", "在哪兒", "在哪", "放哪裡", "放哪", "擺哪", "收哪",
  "哪裡", "哪邊", "哪兒", "哪一個", "哪個", "哪",
  "請問", "告訴我", "我想找", "幫我找", "找一下", "我記得", "有沒有", "有什麼", "有哪些", "是不是",
  "我的", "忘記", "記得", "東西", "什麼", "到底", "剛剛", "現在", "那個", "這個",
  "嗎", "呢", "呀", "啊", "吧", "喔", "了", "的", "把", "要", "去", "在"].sort((a, b) => b.length - a.length);
const FIND_JOIN = /(還有|以及|或是|或者|一起|[跟和與及])/g;

/** 問句拆關鍵字：標點與連接詞當分隔，去掉停用詞。「存摺跟印章在哪」→ ["存摺", "印章"]。 */
export function findKeywords(q: string): string[] {
  let s = String(q || "").replace(/[，,。.！!？?；;、：:「」『』（）()\s]+/g, " ").replace(FIND_JOIN, " ");
  for (const w of FIND_STOP) s = s.split(w).join(" ");
  return s.split(/\s+/).filter((t) => t.length > 0);
}

export interface WhereHit {
  item: WhereItem;
  score: number;
  /** 有 2 字以上關鍵字命中名稱 */
  nameHit: boolean;
}

/** 加權搜尋：名稱 5、位置 3、原話 2；單字關鍵字 ×0.4。分數高的在前，同分依 updatedAt 新的在前。 */
export function localFind(q: string, items: readonly WhereItem[]): WhereHit[] {
  const keywords = findKeywords(q);
  if (keywords.length === 0) return [];
  const scored: WhereHit[] = [];
  for (const item of items) {
    let score = 0;
    let nameHit = false;
    for (const kw of keywords) {
      let s = 0;
      let isName = false;
      if (item.name.includes(kw)) { s = 5; isName = true; }
      else if (item.location.includes(kw)) s = 3;
      else if (item.raw.includes(kw)) s = 2;
      if (s && kw.length === 1) s *= 0.4;
      if (isName && kw.length > 1) nameHit = true;
      score += s;
    }
    if (score > 0) scored.push({ item, score, nameHit });
  }
  return scored.sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
}

/** 「客廳有什麼」：沒有名稱命中時，2 字以上關鍵字包含在位置裡的東西（依 updatedAt 新的在前）。 */
export function placeHits(q: string, items: readonly WhereItem[]): WhereItem[] {
  const hits = localFind(q, items);
  if (hits.some((h) => h.nameHit)) return [];
  const kws = findKeywords(q).filter((k) => k.length >= 2);
  if (!kws.length) return [];
  return items
    .filter((it) => kws.some((k) => it.location.includes(k)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 本機有沒有把握（門檻要嚴，錯的答案比慢一秒糟）：
 * 第一名有名稱命中，且只有一筆或分數 ≥ 第二名 × 1.6；或 placeHits 不是空的。
 */
export function localConfident(q: string, items: readonly WhereItem[]): boolean {
  if (!items.length) return false;
  const hits = localFind(q, items);
  if (hits.length && hits[0].nameHit) return hits.length === 1 || hits[0].score >= hits[1].score * 1.6;
  return placeHits(q, items).length > 0;
}

/** 一筆的回答句：「鑰匙放在「客廳鞋櫃」。」 */
export function answerLine(it: WhereItem): string {
  return `${it.name}放在「${it.location}」。`;
}

/**
 * 本機回答（畫面只在 localConfident 為 true 時呼叫）：
 * 名稱命中且領先 → answerLine(第一名)；否則 placeHits 有東西 → 「有「關鍵字」的位置有：A、B…等等。」（最多 8 個名稱）；
 * 都沒有 → 「清單裡找不到。」
 */
export function localAnswer(q: string, items: readonly WhereItem[]): string {
  const hits = localFind(q, items);
  if (hits.length && hits[0].nameHit && (hits.length === 1 || hits[0].score >= hits[1].score * 1.6)) {
    return answerLine(hits[0].item);
  }
  const inPlace = placeHits(q, items);
  if (inPlace.length) {
    const names = inPlace.slice(0, 8).map((it) => it.name).join("、");
    return `找到這些：${names}${inPlace.length > 8 ? "…等等" : ""}。`;
  }
  return "清單裡找不到。";
}

export interface SaveResult {
  items: WhereItem[];
  /** 同名覆蓋時被取代的舊資料（存檔前的樣子） */
  replaced: WhereItem | null;
  /** 滿 WHERE_MAX 筆時被刪掉的最久沒更新那筆 */
  evicted: WhereItem | null;
}

/**
 * 存一筆：name、location 去頭尾後不可為空（否則丟 Error「請填東西和位置」）；name 截 WHERE_NAME_MAX 字。
 * 1. findSameItem 找到同名 → 更新那一筆（保留 id、createdAt；name 換成新名稱；location、raw、updatedAt 換新），replaced＝舊資料。
 * 2. 沒找到且已有 WHERE_MAX 筆 → 刪掉 updatedAt 最小的一筆（evicted），再新增。
 * 3. 新增：{ id: newId, name, location, raw, createdAt: now, updatedAt: now }。
 * 不改傳入的陣列與物件（回傳新陣列）。
 */
export function applySave(
  items: readonly WhereItem[],
  draft: { name: string; location: string; raw: string },
  now: number,
  newId: string
): SaveResult {
  const name = draft.name.trim().slice(0, WHERE_NAME_MAX);
  const location = draft.location.trim();
  if (!name || !location) throw new Error("請填東西和位置");
  const raw = draft.raw.trim();
  const same = findSameItem(name, items);
  if (same) {
    const updated: WhereItem = { ...same, name, location, raw, updatedAt: now };
    return { items: items.map((it) => (it.id === same.id ? updated : it)), replaced: same, evicted: null };
  }
  let rest = [...items];
  let evicted: WhereItem | null = null;
  if (rest.length >= WHERE_MAX) {
    evicted = rest.reduce((old, it) => (it.updatedAt < old.updatedAt ? it : old));
    rest = rest.filter((it) => it.id !== evicted!.id);
  }
  rest.push({ id: newId, name, location, raw, createdAt: now, updatedAt: now });
  return { items: rest, replaced: null, evicted };
}

/**
 * 存檔後的告知（畫面顯示並可朗讀）：
 * - replaced：「「{新名稱}」之前記在「{舊位置}」，已改成「{新位置}」。」
 * - 都沒有：「記好了：{名稱}放在「{位置}」。」
 * - evicted：上一句後面接「已經記滿 100 筆，刪掉了最久沒更新的「{名稱}」（在「{位置}」）。」
 * replaced 與 evicted 不會同時出現。
 */
export function saveNote(result: SaveResult, saved: { name: string; location: string }): string {
  const name = saved.name.trim().slice(0, WHERE_NAME_MAX);
  const location = saved.location.trim();
  if (result.replaced) return `「${name}」之前記在「${result.replaced.location}」，已改成「${location}」。`;
  const done = `記好了：${name}放在「${location}」。`;
  if (result.evicted) {
    return done + `已經記滿 ${WHERE_MAX} 筆，刪掉了最久沒更新的「${result.evicted.name}」（在「${result.evicted.location}」）。`;
  }
  return done;
}
