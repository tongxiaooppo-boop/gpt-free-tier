// 額度狀態的持久化（IndexedDB，經 idb-keyval）＋跨分頁互斥（navigator.locks）。
// 所有讀改寫都在 withQuotaLock 內完成，邏輯一律呼叫 plan.ts 的純函式，這裡不寫任何計算規則。
// 框架：Opus 2026-11-19。實作者只填函式內容，不得改簽名。

import { get, set } from "idb-keyval";
import type { ModelGroup, Tier } from "../config/models";
import { normalizeDay, planReservation, settle, type DayState, type PlanResult, type Reservation } from "./plan";

export const STORE_KEY = "quota-day-v1";
export const LOCK_NAME = "gpt-free-tier-quota";

/** 以 navigator.locks.request(LOCK_NAME, { mode: "exclusive" }) 包住 fn；瀏覽器不支援 locks 時直接拋錯（不降級）。 */
export async function withQuotaLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) {
    throw new Error("此瀏覽器不支援 navigator.locks，無法安全保留額度");
  }
  return navigator.locks.request(LOCK_NAME, { mode: "exclusive" }, fn);
}

// 只在已持有額度鎖時使用，避免重複取得同一把非重入鎖。
async function loadDay(nowMs: number): Promise<DayState> {
  return normalizeDay((await get<DayState>(STORE_KEY)) ?? null, nowMs);
}

/** 讀出並 normalizeDay 後的當日狀態（唯讀顯示用）。 */
export async function readDay(nowMs: number): Promise<DayState> {
  return withQuotaLock(() => loadDay(nowMs));
}

/** 鎖內：readDay → planReservation → 成功才把 reservation 寫回。id 用 crypto.randomUUID()。 */
export async function reserve(
  tier: Tier,
  model: string,
  estimatedInput: number,
  requestedMaxOutput: number | null,
  nowMs: number
): Promise<PlanResult> {
  return withQuotaLock(async () => {
    const state = await loadDay(nowMs);
    const result = planReservation(state, tier, model, estimatedInput, requestedMaxOutput, nowMs, crypto.randomUUID());
    if (result.ok) {
      await set(STORE_KEY, { ...state, reservations: [...state.reservations, result.reservation] });
    }
    return result;
  });
}

/** 鎖內：readDay → settle → 寫回。 */
export async function settleReservation(
  r: Reservation,
  actual: { input: number; output: number } | null,
  nowMs: number
): Promise<void> {
  await withQuotaLock(async () => {
    await set(STORE_KEY, settle(await loadDay(nowMs), r, actual));
  });
}

/** 鎖內：設定今天在其他地方已用量（設定頁輸入，負數視為 0）。 */
export async function setExternalUsed(group: ModelGroup, tokens: number, nowMs: number): Promise<void> {
  await withQuotaLock(async () => {
    const state = await loadDay(nowMs);
    await set(STORE_KEY, { ...state, externalUsed: { ...state.externalUsed, [group]: Math.max(0, tokens) } });
  });
}
