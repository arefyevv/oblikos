import 'dotenv/config';
import { writeFile } from 'node:fs/promises';

const key = process.env.AITUNNEL_API_KEY?.trim();
if (!key) throw new Error('AITUNNEL key missing');
const input = 'Привет! Я Дарья. Сегодня расскажу, как найти свой стиль и чувствовать себя увереннее.';
const demos = [
  { name: 'grok-eve', model: 'grok-voice-tts-1.0', voice: 'eve', format: 'mp3' },
  { name: 'gemini-kore', model: 'gemini-3.8-flash-lite-tts', voice: 'Kore', format: 'pcm' },
];
for (const demo of demos) {
  const prefix = `artifacts/sample-${demo.name}-20261006`;
  await writeFile(`${prefix}.json`, JSON.stringify({ phase: 'started', model: demo.model, calls: 1 }), { flag: 'wx' });
  try {
    const response = await fetch('https://api.aitunnel.ru/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: demo.model, voice: demo.voice, input, response_format: demo.format }),
      signal: AbortSignal.timeout(60000), redirect: 'error',
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('audio/')) { await response.body?.cancel(); throw new Error('Invalid content type'); }
    let bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Invalid audio size');
    if (demo.format === 'pcm' && bytes.toString('ascii', 0, 4) !== 'RIFF') {
      const rate = Number(contentType.match(/rate=(\d+)/)?.[1] || 24000);
      const header = Buffer.alloc(44);
      header.write('RIFF'); header.writeUInt32LE(bytes.length + 36, 4); header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
      header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(bytes.length, 40);
      bytes = Buffer.concat([header, bytes]);
    }
    const path = `${prefix}.${demo.format === 'pcm' ? 'wav' : 'mp3'}`;
    await writeFile(path, bytes);
    const report = { phase: 'saved', model: demo.model, voice: demo.voice, calls: 1, bytes: bytes.length, costRub: response.headers.get('cost-rub'), path };
    await writeFile(`${prefix}.json`, JSON.stringify(report));
    console.log(JSON.stringify(report));
  } catch (error) {
    const report = { phase: 'failed', model: demo.model, calls: 1, error: error.message };
    await writeFile(`${prefix}.json`, JSON.stringify(report));
    console.log(JSON.stringify(report));
  }
}
