// 對話紀錄（第 3 輪）：每次送出都存成一筆，「紀錄」分頁列出、可開回來看或接著聊、可刪除。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。
//
// 儲存：idb-keyval，key = `gft:conv:<id>`（`gft:` 前綴讓 storage.clearAll() 一起清掉）。
// 上限 MAX_CONVERSATIONS 筆；saveConversation 存完若超過，依 updatedAt 由舊到新刪到剩上限。
// 本檔不碰額度紀錄（quota/store.ts），也不呼叫 API。

import { del, get, keys, set } from "idb-keyval";
import type { ChatMessage } from "../api/openai";

export const MAX_CONVERSATIONS = 100;
export const TITLE_MAX = 30;

export interface Conversation {
  id: string;
  cardId: string;
  /** titleFrom(第一則 user 訊息的文字)；空字串時畫面改顯示卡片名稱 */
  title: string;
  /** 完整歷史（含圖片 data URL）；一次問答的卡也存成 [user, assistant] 兩則 */
  messages: ChatMessage[];
  /** 最後一次使用的模型 id */
  model: string;
  createdAt: number;
  updatedAt: number;
}

/** 隨機 id：用 crypto.randomUUID()。 */
export function newConversationId(): string {
  return crypto.randomUUID();
}

/**
 * 標題：把連續空白（含換行）壓成一個半形空白、去頭尾；超過 TITLE_MAX 個字元（以 Array.from 計）
 * 截成前 TITLE_MAX 個字元再加「…」。
 */
export function titleFrom(text: string): string {
  const chars = Array.from(text.replace(/\s+/gu, " ").trim());
  return chars.slice(0, TITLE_MAX).join("") + (chars.length > TITLE_MAX ? "…" : "");
}

/** 全部紀錄，依 updatedAt 由新到舊。 */
export async function listConversations(): Promise<Conversation[]> {
  const ids = (await keys()).filter(key => typeof key === "string" && key.startsWith("gft:conv:"));
  const records = await Promise.all(ids.map(key => get<Conversation>(key)));
  return records.filter((item): item is Conversation => !!item).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadConversation(id: string): Promise<Conversation | undefined> {
  return get<Conversation>("gft:conv:" + id);
}

/** 寫入（同 id 覆蓋），之後套用 MAX_CONVERSATIONS 上限。 */
export async function saveConversation(conv: Conversation): Promise<void> {
  await set("gft:conv:" + conv.id, conv);
  const all = await listConversations();
  await Promise.all(all.slice(MAX_CONVERSATIONS).map(item => deleteConversation(item.id)));
}

export async function deleteConversation(id: string): Promise<void> {
  await del("gft:conv:" + id);
}
