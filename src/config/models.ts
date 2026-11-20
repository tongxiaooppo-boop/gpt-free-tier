// 模型與額度設定：整個 app 唯一的模型清單來源。使用者不能自行輸入其他模型。
// 依據：OpenAI Help Center「Sharing feedback, evaluation and fine-tuning data, and API inputs and outputs with OpenAI」
// （2026-11-19 擷取）列出的 complimentary tokens 模型組。
// 作者 2026-11-19 指定只上這四個新模型，官方清單上其他（含舊型號、gpt-6-sol、gpt-6-luna）一律不上線。

export type ModelGroup = "large" | "small";
export type Tier = "build" | "launch_grow";

export interface ModelDef {
  id: string;
  label: string;
  group: ModelGroup;
  /** 作者已在自己帳號的 Usage 後台核對過屬於 Data sharing incentive tier（未扣款）才為 true。 */
  verified: boolean;
}

export const MODELS: readonly ModelDef[] = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 luna", group: "small", verified: true },
  { id: "gpt-5.6-terra", label: "GPT-5.6 terra", group: "small", verified: true },
  { id: "gpt-6.1-sol", label: "GPT-6.1 sol", group: "large", verified: true },
  { id: "gpt-6-astra", label: "GPT-6 astra", group: "large", verified: true },
];

// 選單只列 verified 的模型；未核對的等作者實測後改 true 才會出現。
export function selectableModels(): readonly ModelDef[] {
  return MODELS.filter((m) => m.verified);
}

export const DEFAULT_MODEL = "gpt-5.6-luna";

export const GROUP_LABEL: Record<ModelGroup, string> = {
  large: "大模型組（sol／astra）",
  small: "小模型組（luna／terra）",
};

// 每日免費額度（input + output 合計，tokens）。預設 Build（最保守）。
export const DAILY_QUOTA: Record<Tier, Record<ModelGroup, number>> = {
  build: { large: 250_000, small: 2_500_000 },
  launch_grow: { large: 1_000_000, small: 10_000_000 },
};

export const DEFAULT_TIER: Tier = "build";

/** 不在清單內的模型 → null，呼叫端必須拒絕送出。 */
export function modelGroupOf(modelId: string): ModelGroup | null {
  return MODELS.find((m) => m.id === modelId)?.group ?? null;
}
