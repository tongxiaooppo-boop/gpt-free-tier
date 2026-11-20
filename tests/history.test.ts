import "fake-indexeddb/auto";
import { clear, get, set } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_KEY } from "../src/quota/store";
import {
  MAX_CONVERSATIONS,
  deleteConversation,
  listConversations,
  loadConversation,
  saveConversation,
  titleFrom,
  type Conversation,
} from "../src/ui/history";
import { clearAll } from "../src/ui/storage";

const conv = (id: string, updatedAt: number): Conversation => ({
  id,
  cardId: "chat",
  title: id,
  messages: [{ role: "user", content: id }, { role: "assistant", content: "ok" }],
  model: "gpt-5.6-luna",
  createdAt: updatedAt,
  updatedAt,
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

describe("history", () => {
  it("list 依 updatedAt 由新到舊，load 取得同一筆", async () => {
    await saveConversation(conv("a", 1));
    await saveConversation(conv("b", 3));
    await saveConversation(conv("c", 2));
    expect((await listConversations()).map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect((await loadConversation("c"))?.messages[0].content).toBe("c");
  });
  it("同 id 覆蓋不會多一筆", async () => {
    await saveConversation(conv("a", 1));
    await saveConversation({ ...conv("a", 5), title: "改過" });
    const all = await listConversations();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("改過");
  });
  it("delete 後 list 與 load 都看不到", async () => {
    await saveConversation(conv("a", 1));
    await deleteConversation("a");
    expect(await listConversations()).toEqual([]);
    expect(await loadConversation("a")).toBeUndefined();
  });
  it("超過上限時刪掉最舊的", async () => {
    for (let i = 0; i <= MAX_CONVERSATIONS; i++) await saveConversation(conv("n" + i, i));
    const all = await listConversations();
    expect(all).toHaveLength(MAX_CONVERSATIONS);
    expect(all.some((c) => c.id === "n0")).toBe(false);
    expect(all[0].id).toBe("n" + MAX_CONVERSATIONS);
  });
  it("titleFrom 壓空白、去頭尾、超過 30 字截斷加…", () => {
    expect(titleFrom("  第一行\n\n第二行\t x  ")).toBe("第一行 第二行 x");
    expect(titleFrom("")).toBe("");
    expect(titleFrom("一".repeat(31))).toBe("一".repeat(30) + "…");
    expect(titleFrom("一".repeat(30))).toBe("一".repeat(30));
  });
  it("clearAll 清掉紀錄但保留今日額度紀錄", async () => {
    await saveConversation(conv("a", 1));
    await set(STORE_KEY, { marker: 1 });
    await clearAll();
    expect(await listConversations()).toEqual([]);
    expect(await get(STORE_KEY)).toEqual({ marker: 1 });
  });
});
