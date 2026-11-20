import { delMany, get, keys, setMany } from "idb-keyval";
import { DEFAULT_TIER, type Tier } from "../config/models";
import { withQuotaLock } from "../quota/store";
export interface Settings { apiKey: string; tier: Tier; ackVersion: string }
export async function loadSettings(): Promise<Settings> {
  const [apiKey, tier, ackVersion] = await Promise.all([
    get<string>("gft:apiKey"), get<Tier>("gft:tier"), get<string>("gft:ackVersion"),
  ]);
  return { apiKey: apiKey ?? "", tier: tier === "launch_grow" ? tier : DEFAULT_TIER, ackVersion: ackVersion ?? "" };
}
export async function saveSettings(settings: Settings): Promise<void> {
  await setMany(Object.entries(settings).map(([key, value]) => ["gft:" + key, value]));
}
export async function clearAll(): Promise<void> {
  await withQuotaLock(async () => {
    await delMany((await keys()).filter(key => typeof key === "string" && key.startsWith("gft:")));
  });
}
