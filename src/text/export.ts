// 回答標註文字與 Markdown 匯出（第 4 輪）。純函式；下載（Blob＋<a download>）由畫面做。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。
// 數字一律 toLocaleString("en-US")（千分位逗號），日期時間一律台灣時區（Asia/Taipei）。

import type { AnswerMeta } from "../api/openai";
import type { Conversation } from "../ui/history";

/**
 * 一則回答的標註，各段以「 · 」連接：
 *   {modelLabel} · {秒數，小數 1 位} 秒 · 輸入 {input}／輸出 {output} tokens
 * usage 為 null 時第三段改成「用量未知」；incompleteReason 不為 null 時最後加一段「未完成（{reason}）」。
 * 例：「luna · 3.2 秒 · 輸入 1,234／輸出 567 tokens」
 */
export function formatMeta(meta: AnswerMeta, modelLabel: string): string {
  return [modelLabel, `${(meta.ms / 1000).toFixed(1)} 秒`, meta.usage ? `輸入 ${meta.usage.input.toLocaleString("en-US")}／輸出 ${meta.usage.output.toLocaleString("en-US")} tokens` : "用量未知", ...(meta.incompleteReason !== null ? [`未完成（${meta.incompleteReason}）`] : [])].join(" · ");
}

/**
 * 整段對話轉 Markdown。格式（每段之間空一行，結尾一個換行）：
 *
 *   # {conv.title，空字串時用 cardTitle}
 *
 *   - 卡片：{cardTitle}
 *   - 時間：{conv.updatedAt 的 YYYY-MM-DD HH:mm}（台灣）
 *   - 內容曾送給 OpenAI 處理
 *
 *   ## 你
 *
 *   {content}
 *
 *   （附圖 N 張，未匯出）        ← 只在 images 有內容時出現
 *
 *   ## 回答（{formatMeta(meta, labelOf(meta.model))}）   ← 沒有 meta 時標題只寫「## 回答」
 *
 *   {content}
 *
 * 訊息依原順序重複「## 你」「## 回答」段落。圖片 data URL 一律不寫進檔案。
 * @param labelOf 模型 id → 顯示名稱（畫面傳 selectableModels 查表，查不到傳回 id）
 */
export function conversationToMarkdown(conv: Conversation, cardTitle: string, labelOf: (modelId: string) => string): string {
  const dt = taipeiParts(conv.updatedAt);
  const sections = [`# ${conv.title || cardTitle}`, `- 卡片：${cardTitle}\n- 時間：${dt.year}-${dt.month}-${dt.day} ${dt.hour}:${dt.minute}（台灣）\n- 內容曾送給 OpenAI 處理`];
  for (const message of conv.messages) {
    sections.push(message.role === "user" ? "## 你" : message.meta ? `## 回答（${formatMeta(message.meta, labelOf(message.meta.model))}）` : "## 回答", message.content);
    if (message.images?.length) sections.push(`（附圖 ${message.images.length.toLocaleString("en-US")} 張，未匯出）`);
  }
  return sections.join("\n\n") + "\n";
}

/**
 * 下載檔名：{名稱}-{YYYYMMDD-HHmm}.md（台灣時間，用 at）。
 * 名稱：title 去頭尾空白；\ / : * ? " < > | 與空白字元（\s）每個字元各換成一個「_」；超過 30 個字元（Array.from）截斷；空字串用「對話」。
 */
export function exportFileName(title: string, at: number): string {
  const name = Array.from(title.trim().replace(/[\\/:*?"<>|\s]/g, "_")).slice(0, 30).join("") || "對話";
  const dt = taipeiParts(at);
  return `${name}-${dt.year}${dt.month}${dt.day}-${dt.hour}${dt.minute}.md`;
}

function taipeiParts(at: number): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map(part => [part.type, part.value]));
}
