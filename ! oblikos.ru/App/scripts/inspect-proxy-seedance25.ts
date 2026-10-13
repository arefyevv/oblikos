import "dotenv/config";
const key = process.env.OPENAI_API_KEY?.trim();
if (!key) throw new Error("ProxyAPI key missing");
const response = await fetch("https://api.proxyapi.ru/v1/videos/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000), redirect: "error" });
if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
const catalog = await response.json();
const models = Array.isArray(catalog) ? catalog : Array.isArray(catalog.data) ? catalog.data : Array.isArray(catalog.models) ? catalog.models : Object.entries(catalog).map(([id, value]) => ({ id, ...(typeof value === "object" && value ? value : {}) }));
const selected = models.filter((model: { id?: string; name?: string }) => /seedance.*2[.-]5/i.test(model.id || model.name || ""));
console.log(JSON.stringify({ count: selected.length, models: selected }, null, 2));
