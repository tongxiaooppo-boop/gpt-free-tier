import "fake-indexeddb/auto";
import { clear, get, set } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDay } from "../src/quota/plan";
import { LOCK_NAME, STORE_KEY, readDay, reserve, setExternalUsed, settleReservation } from "../src/quota/store";

const NOW = Date.UTC(2026, 10, 19, 1, 0, 0);

beforeEach(async () => {
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn((name: string, options: { mode: string }, fn: () => Promise<unknown>) => {
        expect(name).toBe(LOCK_NAME);
        expect(options).toEqual({ mode: "exclusive" });
        const result = queue.then(fn);
        queue = result.catch(() => undefined);
        return result;
      }),
    },
  });
  await clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("quota store", () => {
  it("reserve 成功後 readDay 看得到保留", async () => {
    const result = await reserve("build", "gpt-6.1-sol", 1_000, null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await readDay(NOW)).reservations).toEqual([result.reservation]);
    expect(result.reservation.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reserve 失敗不寫入", async () => {
    expect(await reserve("build", "unknown", 1_000, null, NOW)).toMatchObject({ ok: false });
    expect(await get(STORE_KEY)).toBeUndefined();
    const state = { ...emptyDay("2026-11-19"), used: { large: 237_500, small: 0 } };
    await set(STORE_KEY, state);
    expect(await reserve("build", "gpt-6.1-sol", 1_000, null, NOW)).toMatchObject({ ok: false });
    expect(await get(STORE_KEY)).toEqual(state);
  });

  it("兩個 reserve 併發，總保留不超過 limit", async () => {
    // 每筆 input 保留 196,000，加回答 4,000，合計 200,000。
    const results = await Promise.all([
      reserve("build", "gpt-6.1-sol", 150_000, 4_000, NOW),
      reserve("build", "gpt-6.1-sol", 150_000, 4_000, NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "quota_exhausted", limit: 237_500 });
    const state = await readDay(NOW);
    expect(state.reservations).toHaveLength(1);
    expect(state.reservations[0].tokens).toBe(200_000);
  });

  it("settleReservation(null) 整筆計入", async () => {
    const result = await reserve("build", "gpt-6.1-sol", 1_000, null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await settleReservation(result.reservation, null, NOW);
    const state = await readDay(NOW);
    expect(state.used.large).toBe(result.reservation.tokens);
    expect(state.reservations).toEqual([]);
  });

  it("setExternalUsed 負數視為 0", async () => {
    await setExternalUsed("small", 12_345, NOW);
    await setExternalUsed("large", 99, NOW);
    await setExternalUsed("large", -100, NOW);
    expect((await readDay(NOW)).externalUsed).toEqual({ large: 0, small: 12_345 });
  });
});
