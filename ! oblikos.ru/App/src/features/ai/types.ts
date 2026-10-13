export type CharacterContext = {
  identity: Record<string, string>;
  personality: Record<string, string | string[]>;
  memory: { type: string; content: string; isPinned: boolean; importance: number }[];
};
export type Prompt = { system: string; character: string; task: string };
export type AIResult = { body: string; provider: string; model: string };
export interface AIProvider { generate(prompt: Prompt): Promise<AIResult> }

export class AIError extends Error {
  constructor(public readonly code: "configuration" | "timeout" | "rate_limit" | "network" | "response" | "provider") {
    super(code); this.name = "AIError";
  }
}
export const aiMessages: Record<AIError["code"], string> = {
  configuration: "Генерация пока не настроена. Обратитесь к администратору.",
  timeout: "Генерация заняла слишком много времени. Повторите попытку.",
  rate_limit: "Сервис генерации временно ограничил запросы. Попробуйте позже.",
  network: "Не удалось связаться с сервисом генерации. Попробуйте позже.",
  response: "Сервис не вернул готовый текст. Попробуйте уточнить задачу.",
  provider: "Сервис генерации временно недоступен. Попробуйте позже.",
};
