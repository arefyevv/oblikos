import 'dotenv/config';
import { writeFile } from 'node:fs/promises';

const text = 'Привет! Я Дарья. Сегодня расскажу, как найти свой стиль и чувствовать себя увереннее.';
const demos = [
  { name: 'seed-custom', endpoint: 'https://api.aitunnel.ru/v1/audio/speech', key: process.env.AITUNNEL_API_KEY,
    body: { model: 'seed-audio-1-0', input: text, response_format: 'mp3', instructions: 'A young adult female voice speaking fluent Russian. Warm, natural, confident conversational delivery, normal pace. Read only the supplied text.' } },
  { name: 'openai-coral', endpoint: 'https://api.proxyapi.ru/v1/audio/speech', key: process.env.OPENAI_API_KEY,
    body: { model: 'openai/gpt-4o-mini-tts', voice: 'coral', input: text, response_format: 'mp3', speed: 1,
      instructions: 'Говори по-русски, тепло и уверенно, естественно и без театральных интонаций. Обычный темп.' } },
  { name: 'minimax-turbo', endpoint: 'https://api.aitunnel.ru/v1/audio/speech', key: process.env.AITUNNEL_API_KEY,
    body: { model: 'speech-2.8-turbo', voice: 'Russian_BrightHeroine', input: text, response_format: 'mp3' } },
];
for (const demo of demos) {
  if (!demo.key?.trim()) throw new Error(`Missing key for ${demo.name}`);
  await writeFile(`artifacts/sample-${demo.name}-20261006.json`, JSON.stringify({ phase: 'started', calls: 1 }), { flag: 'wx' });
}
await Promise.all(demos.map(async demo => {
  const prefix = `artifacts/sample-${demo.name}-20261006`;
  try {
    const response = await fetch(demo.endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${demo.key.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(demo.body), signal: AbortSignal.timeout(60000), redirect: 'error',
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    if (!/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel(); throw new Error('Invalid content type');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 4 || bytes.length > 8 * 1024 * 1024 ||
      !(bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))) throw new Error('Invalid MP3');
    await writeFile(`${prefix}.mp3`, bytes);
    const report = { phase: 'saved', model: demo.body.model, voice: demo.body.voice || 'custom', calls: 1,
      bytes: bytes.length, costRub: response.headers.get('cost-rub'), path: `${prefix}.mp3` };
    await writeFile(`${prefix}.json`, JSON.stringify(report));
    console.log(JSON.stringify(report));
  } catch (error) {
    const report = { phase: 'failed', model: demo.body.model, calls: 1, error: error.message };
    await writeFile(`${prefix}.json`, JSON.stringify(report));
    console.log(JSON.stringify(report));
  }
}));
