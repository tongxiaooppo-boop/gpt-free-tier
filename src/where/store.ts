// 「東西放哪」的本機儲存（第 5 輪）。
// 框架：Opus 2026-11-19。實作者只填函式內容，不改名稱、參數、回傳型別與本檔註解。
//
// 儲存：idb-keyval，單一 key WHERE_KEY 存整個 WhereItem 陣列（最多 100 筆，很小）。
// `gft:` 前綴讓 storage.clearAll() 一起清掉。不碰額度紀錄，也不呼叫 API。

import { get, set, update } from "idb-keyval";
import type { WhereItem } from "./rules";

export const WHERE_KEY = "gft:where:items";

/** 讀全部；沒有資料或資料不是陣列時回傳 []。回傳順序：updatedAt 新的在前。 */
export async function loadWhereItems(): Promise<WhereItem[]> {
  const items = await get<unknown>(WHERE_KEY);
  return Array.isArray(items) ? [...items].sort((a, b) => b.updatedAt - a.updatedAt) : [];
}

/** 整份覆蓋寫入（applySave 的結果直接存）。 */
export async function saveWhereItems(items: readonly WhereItem[]): Promise<void> {
  await set(WHERE_KEY, [...items]);
}

/** 刪一筆（依 id）；找不到不報錯。 */
export async function deleteWhereItem(id: string): Promise<void> {
  await update(WHERE_KEY, (items: unknown) => Array.isArray(items) ? items.filter(item => item.id !== id) : []);
}
