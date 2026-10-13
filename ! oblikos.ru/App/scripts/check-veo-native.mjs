import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { writeFile } from "node:fs/promises";

// Read-only catalogue check through official SDK. No endpoint probes or create.
const nativeModels = {
  "google/veo-3.1": "veo-3.1-generate-preview",
  "google/veo-3.1-fast": "veo-3.1-fast-generate-preview",
  "google/veo-3.1-lite": "veo-3.1-lite-generate-preview",
};
const catalogueModel = process.env.OPENAI_VIDEO_MODEL?.trim();
const nativeModel = nativeModels[catalogueModel], key = process.env.OPENAI_API_KEY?.trim();
if (!nativeModel || !key) throw new Error("Native model/key configuration is missing");
const baseUrl = "https://api.proxyapi.ru";
const audit = { checkedAt: new Date().toISOString(), baseUrl, catalogueModel, nativeModel, createRequests: 0, selectedModelFound: false, catalogueComplete: false, veoModels: [] };
const ai = new GoogleGenAI({ apiKey: key, httpOptions: { baseUrl, apiVersion: "v1beta", timeout: 15000, retryOptions: { attempts: 1 },
  fetch: async (input, init) => {
    const url = new URL(String(input));
    if ((init?.method || "GET") !== "GET" || url.origin !== baseUrl || url.pathname !== "/v1beta/models") throw new Error("Unexpected catalogue request");
    audit.endpoint = url.origin + url.pathname;
    const response = await fetch(input, { ...init, redirect: "error" });
    audit.httpStatus = response.status;
    return response;
  },
} });
try {
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  let count = 0;
  for await (const model of pager) {
    if (model.name?.includes("veo")) audit.veoModels.push({ name: model.name, supportedActions: model.supportedActions });
    if (model.name === "models/" + nativeModel && model.supportedActions?.includes("predictLongRunning")) { audit.selectedModelFound = true; break; }
    if (++count >= 200) break;
  }
  // A successful catalogue GET proves only model metadata, not create availability.
} catch (error) { audit.errorType = error?.name || "Error"; audit.httpStatus = typeof error?.status === "number" ? error.status : undefined; }
await writeFile("artifacts/veo-unified-preflight.json", JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
if (!audit.selectedModelFound) process.exitCode = 1;
