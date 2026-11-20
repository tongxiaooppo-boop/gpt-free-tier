import "fake-indexeddb/auto";
import { clear, get, set } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_KEY } from "../src/quota/store";
import { clearAll } from "../src/ui/storage";
import type { WhereItem } from "../src/where/rules";
import { WHERE_KEY, deleteWhereItem, loadWhereItems, saveWhereItems } from "../src/where/store";

const item = (id: string, updatedAt: number): WhereItem => ({
  id, name: "東西" + id, location: "櫃子", raw: "", createdAt: updatedAt, updatedAt,
});

beforeEach(async () => {
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn((_name: string, _options: unknown, fn: () => Promise<unknown>) => {
        const result = queue.then(fn);
        queue = result.catch(() => undefined);
        return result;
      }),
    },
  });
  await clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("where 儲存", () => {
  it("沒資料或資料壞掉回 []", async () => {
    expect(await loadWhereItems()).toEqual([]);
    await set(WHERE_KEY, { bad: true });
    expect(await loadWhereItems()).toEqual([]);
  });
  it("存了讀得回來，依 updatedAt 新的在前", async () => {
    await saveWhereItems([item("a", 1), item("b", 3), item("c", 2)]);
    expect((await loadWhereItems()).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("刪一筆；刪不存在的不報錯", async () => {
    await saveWhereItems([item("a", 1), item("b", 2)]);
    await deleteWhereItem("a");
    await deleteWhereItem("zzz");
    expect((await loadWhereItems()).map((x) => x.id)).toEqual(["b"]);
  });
  it("clearAll 一起清掉，保留今日額度紀錄", async () => {
    await saveWhereItems([item("a", 1)]);
    await set(STORE_KEY, { marker: 1 });
    await clearAll();
    expect(await loadWhereItems()).toEqual([]);
    expect(await get(STORE_KEY)).toEqual({ marker: 1 });
  });
});
