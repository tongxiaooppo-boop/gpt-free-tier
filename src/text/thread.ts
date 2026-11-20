// 對話串編輯（第 4 輪）：multiTurn 卡可以改一則已送出的 user 訊息再重送，之後的對話全部丟掉。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。

import type { ChatMessage } from "../api/openai";

/**
 * 回傳新陣列：messages[0..index) 原樣保留，加上改過內容的那則 user 訊息（保留原本的 images），index 之後全部丟掉。
 * 不改動傳入的陣列與物件。
 * messages[index] 不存在或不是 user → 丟 Error("只能編輯自己送出的訊息")。
 * content 去頭尾空白後是空字串 → 丟 Error("內容不能是空的")。
 */
export function editUserMessage(messages: ChatMessage[], index: number, content: string): ChatMessage[] {
  const message = messages[index];
  if (!message || message.role !== "user") throw new Error("只能編輯自己送出的訊息");
  const trimmed = content.trim();
  if (!trimmed) throw new Error("內容不能是空的");
  return [...messages.slice(0, index), { ...message, content: trimmed }];
}
