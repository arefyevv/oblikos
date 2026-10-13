import 'dotenv/config';
import { writeFile } from 'node:fs/promises';

const marker = 'artifacts/gemini-controls-check-20261006.json';
await writeFile(marker, JSON.stringify({ phase: 'started', calls: 1 }), { flag: 'wx' });
const response = await fetch('https://api.aitunnel.ru/v1/audio/speech', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.AITUNNEL_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemini-3.8-flash-lite-tts', voice: 'Kore', response_format: 'pcm',
    input: [{ type: 'user_input', content: [{ type: 'text', text: 'Привет! Рада тебя видеть.',
      annotations: [{ type: 'speech_metadata', style: 'Speak slowly, warmly and calmly.' }] }] }],
  }),
  signal: AbortSignal.timeout(60000), redirect: 'error',
});
const report = { phase: 'checked', calls: 1, status: response.status, contentType: response.headers.get('content-type'), costRub: response.headers.get('cost-rub') };
if (!response.ok) {
  const body = await response.json().catch(() => null);
  report.error = body?.error?.message || body?.detail || 'Request rejected';
} else {
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile('artifacts/gemini-controls-check-20261006.pcm', bytes);
  report.bytes = bytes.length;
}
await writeFile(marker, JSON.stringify(report));
console.log(JSON.stringify(report));
