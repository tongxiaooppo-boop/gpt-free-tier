import { describe, expect, it } from "vitest";
import {
  emptyDay,
  groupLimit,
  normalizeDay,
  planReservation,
  settle,
  utcDay,
  type DayState,
} from "../src/quota/plan";

// 2026-11-19T01:00:00Z（台灣 09:00）
const NOW = Date.UTC(2026, 10, 19, 1, 0, 0);

function day(over: Partial<DayState> = {}): DayState {
  return { ...emptyDay("2026-11-19"), ...over };
}

describe("groupLimit", () => {
  it("build 大模型組 = 237,500（扣 5%）", () => expect(groupLimit("build", "large")).toBe(237_500));
  it("build 小模型組 = 2,375,000", () => expect(groupLimit("build", "small")).toBe(2_375_000));
  it("launch_grow 大模型組 = 950,000", () => expect(groupLimit("launch_grow", "large")).toBe(950_000));
});

describe("planReservation", () => {
  it("空的一天：input 1,000 → needInput 2,300、回答上限 32,000", () => {
    const r = planReservation(day(), "build", "gpt-6.1-sol", 1_000, null, NOW, "a");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.needInput).toBe(2_300);
    expect(r.maxOutputTokens).toBe(32_000);
    expect(r.reservation.tokens).toBe(34_300);
    expect(r.reservation.expiresAt).toBe(NOW + 30 * 60_000);
  });

  it("剩餘不夠 32,000 時回答上限壓到剩餘空間", () => {
    const s = day({ used: { large: 230_000, small: 0 } });
    const r = planReservation(s, "build", "gpt-6.1-sol", 1_000, null, NOW, "a");
    expect(r.ok && r.maxOutputTokens).toBe(237_500 - 230_000 - 2_300); // 5,200
  });

  it("剩餘回答空間 < 1,000 → 拒絕 quota_exhausted", () => {
    const s = day({ used: { large: 234_500, small: 0 } }); // room = 700
    const r = planReservation(s, "build", "gpt-6.1-sol", 1_000, null, NOW, "a");
    expect(r).toMatchObject({ ok: false, reason: "quota_exhausted" });
  });

  it("其他裝置已用量（externalUsed）與進行中保留都要算進去", () => {
    const s = day({
      externalUsed: { large: 200_000, small: 0 },
      reservations: [{ id: "x", group: "large", tokens: 30_000, expiresAt: NOW + 1 }],
    });
    const r = planReservation(s, "build", "gpt-6-astra", 1_000, null, NOW, "a");
    expect(r).toMatchObject({ ok: true, usedBefore: 230_000, maxOutputTokens: 5_200 });
  });

  it("不同組互不影響：大模型組用完，小模型組照常", () => {
    const s = day({ used: { large: 237_500, small: 0 } });
    expect(planReservation(s, "build", "gpt-6.1-sol", 10, null, NOW, "a").ok).toBe(false);
    expect(planReservation(s, "build", "gpt-5.6-luna", 10, null, NOW, "a").ok).toBe(true);
  });

  it("清單外模型 → 拒絕 unknown_model", () => {
    const r = planReservation(day(), "build", "gpt-4o", 10, null, NOW, "a");
    expect(r).toMatchObject({ ok: false, reason: "unknown_model" });
  });

  it("使用者指定較小的回答上限就用指定值", () => {
    const r = planReservation(day(), "build", "gpt-5.6-luna", 10, 4_000, NOW, "a");
    expect(r.ok && r.maxOutputTokens).toBe(4_000);
  });
});

describe("normalizeDay", () => {
  it("UTC 跨日（台灣 08:00）歸零", () => {
    const s = day({ used: { large: 5, small: 5 } });
    const next = normalizeDay(s, Date.UTC(2026, 10, 20, 0, 0, 1));
    expect(next.day).toBe("2026-11-20");
    expect(next.used).toEqual({ large: 0, small: 0 });
  });
  it("清掉過期保留、保留未過期的", () => {
    const s = day({
      reservations: [
        { id: "old", group: "large", tokens: 1, expiresAt: NOW - 1 },
        { id: "new", group: "large", tokens: 1, expiresAt: NOW + 1 },
      ],
    });
    expect(normalizeDay(s, NOW).reservations.map((r) => r.id)).toEqual(["new"]);
  });
  it("utcDay 用 UTC 不用本地時區", () => expect(utcDay(Date.UTC(2026, 10, 19, 23, 59))).toBe("2026-11-19"));
});

describe("settle", () => {
  const rsv = { id: "a", group: "large" as const, tokens: 34_300, expiresAt: NOW + 1 };
  it("有實際用量：移除保留、記入 input+output", () => {
    const s = settle(day({ reservations: [rsv] }), rsv, { input: 900, output: 2_000 });
    expect(s.reservations).toEqual([]);
    expect(s.used.large).toBe(2_900);
  });
  it("實際用量未知：整筆保留量計入", () => {
    expect(settle(day({ reservations: [rsv] }), rsv, null).used.large).toBe(34_300);
  });
  it("保留已過期被清掉，仍計入用量", () => {
    expect(settle(day(), rsv, { input: 1, output: 2 }).used.large).toBe(3);
  });
});
