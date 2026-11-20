// 字數、token 預估、長文折疊（第 4 輪）。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。

import { estimateTextTokens } from "../api/openai";

/** 超過這個字數的訊息在對話串裡預設折疊。 */
export const FOLD_CHARS = 800;
/** 折疊時顯示前幾個字。 */
export const FOLD_PREVIEW_CHARS = 200;

/** chars 以 Array.from(text).length 計；tokens 用 estimateTextTokens（不含每則訊息的 +8）。 */
export function textStats(text: string): { chars: number; tokens: number } {
  return { chars: Array.from(text).length, tokens: estimateTextTokens(text) };
}

/**
 * 字數 ≤ FOLD_CHARS：{ folded: false, preview: text, chars }。
 * 超過：{ folded: true, preview: 前 FOLD_PREVIEW_CHARS 個字（Array.from 計）+「…」, chars }。
 */
export function foldText(text: string): { folded: boolean; preview: string; chars: number } {
  const chars = Array.from(text);
  return { folded: chars.length > FOLD_CHARS, preview: chars.length > FOLD_CHARS ? chars.slice(0, FOLD_PREVIEW_CHARS).join("") + "…" : text, chars: chars.length };
}
