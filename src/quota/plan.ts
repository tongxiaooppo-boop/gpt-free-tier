// 額度保留的純函式（不碰儲存、不碰時間來源以外的東西），由 store.ts 在鎖內呼叫。
// 規則（OpenAI：逐筆判斷，只要一筆讓當日總量跨線，整筆照原價收費）：
//   已用 + 校正量 + 進行中保留 + 本次 input 預估（含安全係數）+ 回答上限 ≤ 額度 × (1 − 保留比例)
// 回答上限自動壓到剩餘空間內；空間不足 MIN_OUTPUT_TOKENS 就拒絕。寧可拒絕，不可超額。

import { DAILY_QUOTA, modelGroupOf, type ModelGroup, type Tier } from "../config/models";

export const QUOTA_HOLDBACK_RATIO = 0.05;
export const INPUT_SAFETY_FACTOR = 1.3;
export const INPUT_SAFETY_MARGIN = 1_000;
export const MIN_OUTPUT_TOKENS = 1_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;
export const RESERVATION_TTL_MS = 30 * 60_000;

export interface Reservation {
  id: string;
  group: ModelGroup;
  tokens: number;
  expiresAt: number; // epoch ms
}

/** 某個 UTC 日的狀態。 */
export interface DayState {
  day: string; // YYYY-MM-DD（UTC）
  used: Record<ModelGroup, number>; // 本裝置實際用量（input+output）
  /** 使用者手動輸入：今天在其他裝置／Playground／其他程式已用的量。 */
  externalUsed: Record<ModelGroup, number>;
  reservations: Reservation[];
}

export type PlanResult =
  | {
      ok: true;
      group: ModelGroup;
      limit: number;
      usedBefore: number;
      needInput: number;
      maxOutputTokens: number;
      reservation: Reservation;
    }
  | {
      ok: false;
      reason: "unknown_model" | "quota_exhausted";
      group: ModelGroup | null;
      limit: number;
      usedBefore: number;
      needInput: number;
    };

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function emptyDay(day: string): DayState {
  return {
    day,
    used: { large: 0, small: 0 },
    externalUsed: { large: 0, small: 0 },
    reservations: [],
  };
}

/** 跨日就換新的一天（UTC 00:00＝台灣 08:00 重置），並清掉過期保留。不改動傳入物件。 */
export function normalizeDay(state: DayState | null, nowMs: number): DayState {
  const today = utcDay(nowMs);
  if (!state || state.day !== today) return emptyDay(today);
  return { ...state, reservations: state.reservations.filter((r) => r.expiresAt > nowMs) };
}

export function groupLimit(tier: Tier, group: ModelGroup): number {
  return Math.floor(DAILY_QUOTA[tier][group] * (1 - QUOTA_HOLDBACK_RATIO));
}

export function groupUsedBefore(state: DayState, group: ModelGroup): number {
  const reserved = state.reservations
    .filter((r) => r.group === group)
    .reduce((n, r) => n + r.tokens, 0);
  return state.used[group] + state.externalUsed[group] + reserved;
}

/**
 * 計算這次請求能不能送、回答上限多少。state 必須先經過 normalizeDay。
 * 成功時回傳要加入 state.reservations 的保留（由呼叫端寫入）。
 */
export function planReservation(
  state: DayState,
  tier: Tier,
  model: string,
  estimatedInput: number,
  requestedMaxOutput: number | null,
  nowMs: number,
  id: string
): PlanResult {
  const needInput = Math.ceil(estimatedInput * INPUT_SAFETY_FACTOR) + INPUT_SAFETY_MARGIN;
  const group = modelGroupOf(model);
  if (!group) {
    return { ok: false, reason: "unknown_model", group: null, limit: 0, usedBefore: 0, needInput };
  }
  const limit = groupLimit(tier, group);
  const usedBefore = groupUsedBefore(state, group);
  const room = limit - usedBefore - needInput;
  const maxOutputTokens = Math.min(requestedMaxOutput || DEFAULT_MAX_OUTPUT_TOKENS, room);
  if (maxOutputTokens < MIN_OUTPUT_TOKENS) {
    return { ok: false, reason: "quota_exhausted", group, limit, usedBefore, needInput };
  }
  return {
    ok: true,
    group,
    limit,
    usedBefore,
    needInput,
    maxOutputTokens,
    reservation: { id, group, tokens: needInput + maxOutputTokens, expiresAt: nowMs + RESERVATION_TTL_MS },
  };
}

/**
 * 結算：移除保留、記入用量。
 * actual 為 null（中途停止、斷線、拿不到 usage）時，以整筆保留量計入——寧可多算。
 * 請求根本沒送出（例如網路錯誤發生在建立連線前）才傳 actual = { input: 0, output: 0 }。
 */
// 傳入保留物件本身（不是 id）：保留過期被清掉、或請求跨過 UTC 00:00 時，仍能計入用量。
export function settle(
  state: DayState,
  r: Reservation,
  actual: { input: number; output: number } | null
): DayState {
  const reservations = state.reservations.filter((x) => x.id !== r.id);
  const add = actual ? actual.input + actual.output : r.tokens;
  return { ...state, reservations, used: { ...state.used, [r.group]: state.used[r.group] + add } };
}
