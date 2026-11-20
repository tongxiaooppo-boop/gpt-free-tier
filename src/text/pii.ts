// 送出前去識別化（第 4 輪）：偵測身分證、電話、Email、統編，一鍵換成代號。所有卡片共用。
// 來源：作者的 law 專案 src/ai/pii.js（Opus 框架、Cline 實作，2026）移植成 TS，規則與測試案例照抄。
// 本檔 Opus 寫完，實作者不得修改。
// 人名無法可靠偵測，不在這裡處理：畫面顯示 PII_NAME_HINT 請使用者自己改成甲、乙。
// 代號對照表（map）只存在記憶體，不送出、不存檔；回答裡的代號不還原。

export type PiiType = "id" | "phone" | "email" | "ubn";

/** start／end 為 UTF-16 索引（end 不含）；text = 原文 slice(start, end) */
export interface PiiHit {
  type: PiiType;
  start: number;
  end: number;
  text: string;
}

export interface PiiMapEntry {
  token: string;
  original: string;
}

/** 去識別化代號的類別名稱。 */
export const PII_LABEL: Record<PiiType, string> = { id: "身分證", phone: "電話", email: "Email", ubn: "統編" };

export const PII_NAME_HINT = "人名、地址、帳號偵測不到，請自己改成「甲、乙」或「某路某號」再送出。";

function normalize(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0xff10 && c <= 0xff19) || (c >= 0xff21 && c <= 0xff3a) || (c >= 0xff41 && c <= 0xff5a)) {
      out += String.fromCharCode(c - 0xfee0);
    } else {
      out += text[i];
    }
  }
  return out;
}

const isAlnum = (ch: string): boolean => /[A-Za-z0-9]/.test(ch);

/**
 * 偵測個資。規則（全形英數先視同半形比對，但回傳的 start／end／text 以原文為準）：
 *  - id：身分證／居留證：1 個英文字母（大小寫皆可）＋ [12]（國民）或 [89]（新式居留證）＋ 8 位數字。
 *  - phone：手機 09 開頭共 10 碼，可用 '-' 或空白分成 4-3-3；
 *           市話：(0X)、(0XX)、0X-、0XX- 後接 7～8 碼（中間可有一個 '-'）。
 *  - email：一般 Email（local@domain.tld）。
 *  - ubn：8 位數字，且前方 6 個字元內出現「統編」或「統一編號」。
 *  - 每個命中的前後一個字元都不能是英數字。
 *  - 依 start 排序；重疊時保留較早開始的（同起點取較長的）。
 */
export function detectPII(text: string): PiiHit[] {
  const norm = normalize(text);
  const hits: PiiHit[] = [];
  const push = (type: PiiType, start: number, end: number): void => {
    const before = start > 0 ? norm[start - 1] : "";
    const after = end < norm.length ? norm[end] : "";
    if ((before && isAlnum(before)) || (after && isAlnum(after))) return;
    hits.push({ type, start, end, text: text.slice(start, end) });
  };

  for (const m of norm.matchAll(/[A-Za-z][1289]\d{8}/g)) push("id", m.index!, m.index! + m[0].length);
  for (const m of norm.matchAll(/09\d{2}[- ]?\d{3}[- ]?\d{3}/g)) push("phone", m.index!, m.index! + m[0].length);
  for (const m of norm.matchAll(/(?:\(0\d{1,2}\)|0\d{1,2}-)(?:\d{7,8}|\d{3,4}-\d{4})/g)) push("phone", m.index!, m.index! + m[0].length);
  for (const m of norm.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) push("email", m.index!, m.index! + m[0].length);
  for (const m of norm.matchAll(/\d{8}/g)) {
    const start = m.index!;
    const pre = norm.slice(Math.max(0, start - 6), start);
    if (!/(統編|統一編號)/.test(pre)) continue;
    push("ubn", start, start + 8);
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PiiHit[] = [];
  for (const h of hits) {
    const last = kept[kept.length - 1];
    if (!last || h.start >= last.end) kept.push(h);
  }
  return kept;
}

/**
 * 依 hits 把原文換成〔{PII_LABEL[type]}{A,B,C…}〕：同類別依第一次出現順序給 A、B、C…；
 * 同類別且 text 相同（去掉空白與 '-'）→ 同一代號。hits 可以是 detectPII 結果的子集。
 */
export function maskPII(text: string, hits: PiiHit[]): { text: string; map: PiiMapEntry[] } {
  const sorted = [...hits].sort((a, b) => a.start - b.start || a.end - b.end);
  const map: PiiMapEntry[] = [];
  const perType = new Map<PiiType, { count: number; keyToLetter: Map<string, string> }>();
  const repls: { start: number; end: number; token: string }[] = [];

  for (const h of sorted) {
    const label = PII_LABEL[h.type];
    if (!label) continue;
    const key = h.text.replace(/[-\s]/g, "");
    let bucket = perType.get(h.type);
    if (!bucket) {
      bucket = { count: 0, keyToLetter: new Map() };
      perType.set(h.type, bucket);
    }
    let letter = bucket.keyToLetter.get(key);
    if (!letter) {
      letter = String.fromCharCode(65 + bucket.count);
      bucket.count += 1;
      bucket.keyToLetter.set(key, letter);
      map.push({ token: "〔" + label + letter + "〕", original: h.text });
    }
    repls.push({ start: h.start, end: h.end, token: "〔" + label + letter + "〕" });
  }

  let out = "";
  let pos = 0;
  for (const r of repls) {
    if (r.start < pos) continue;
    out += text.slice(pos, r.start) + r.token;
    pos = r.end;
  }
  out += text.slice(pos);
  return { text: out, map };
}

// ---- 卡片表單用（本專案新增）：多個欄位一起掃描／遮蔽，同一個號碼在不同欄位得到同一代號 ----

/** 欄位之間的分隔：NUL 不是英數字、不會被任何規則吃進去，所以命中不會跨欄位。 */
const FIELD_SEP = "\n\u0000\n";

/** 掃描 fieldIds 指定的欄位（依給定順序串接後偵測）。只用來顯示「找到哪些」，位置不對應單一欄位。 */
export function scanFields(values: Record<string, string>, fieldIds: string[]): PiiHit[] {
  return detectPII(fieldIds.map((id) => values[id] ?? "").join(FIELD_SEP));
}

/** 遮蔽 fieldIds 指定的欄位；其他欄位原樣保留。代號跨欄位一致。 */
export function maskFields(
  values: Record<string, string>,
  fieldIds: string[]
): { values: Record<string, string>; map: PiiMapEntry[] } {
  const joined = fieldIds.map((id) => values[id] ?? "").join(FIELD_SEP);
  const { text, map } = maskPII(joined, detectPII(joined));
  const parts = text.split(FIELD_SEP);
  const next = { ...values };
  fieldIds.forEach((id, i) => {
    if (id in values) next[id] = parts[i];
  });
  return { values: next, map };
}
