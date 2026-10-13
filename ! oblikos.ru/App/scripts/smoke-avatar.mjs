import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const marker = 'artifacts/avatar-live-20261007.json';
const key = process.env.AITUNNEL_API_KEY;
if (!key) throw new Error('AITUNNEL key is missing');
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const save = data => writeFile(marker, JSON.stringify(data, null, 2));
const safeError = value => String(value || '').replaceAll(key, '[redacted]').replace(/https?:\/\/\S+/g, '[url]').slice(0, 600);
let state;
if (process.argv.includes('--poll')) {
  state = JSON.parse(await readFile(marker, 'utf8'));
  if (!state.id) throw new Error('No job id; a second paid POST is not allowed');
  const response = await fetch(`https://api.aitunnel.ru/v1/videos/${encodeURIComponent(state.id)}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const job = await response.json();
  state.status = job.status; state.pollHTTP = response.status;
  state.error = safeError(job.error); state.costRub = job.usage?.cost_rub;
  if (job.status === 'completed') {
    const file = await fetch(`https://api.aitunnel.ru/v1/videos/${encodeURIComponent(state.id)}/content?index=0`, { headers, redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!file.ok) throw new Error(`Download HTTP ${file.status}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 100 * 1024 * 1024) throw new Error('Result exceeds file limit');
    state.file = 'artifacts/avatar-live-20261007.mp4'; state.fileSize = bytes.length;
    await writeFile(state.file, bytes);
  }
  await save(state);
} else {
  state = { model: 'avatar-iv', duration: 5, phase: 'preflight', paidPosts: 0 };
  try { await writeFile(marker, JSON.stringify(state), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(marker, 'utf8'));
    if (previous.paidPosts !== 0 || previous.phase !== 'preflight') throw new Error('Paid request already attempted; use --poll');
  }
  const image = await sharp('public/blog/media/sofia.webp').resize({ width: 720 }).jpeg().toBuffer();
  const wav = await readFile('public/media/voice-samples/gemini31-kore-fast.wav');
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 36, 40) !== 'data') throw new Error('Unexpected WAV layout');
  const bytesPerSecond = wav.readUInt32LE(28);
  const audio = Buffer.from(wav.subarray(0, 44 + Math.min(wav.readUInt32LE(40), bytesPerSecond * 4)));
  audio.writeUInt32LE(audio.length - 8, 4); audio.writeUInt32LE(audio.length - 44, 40);
  state.phase = 'submitted'; state.paidPosts = 1; await save(state);
  const response = await fetch('https://api.aitunnel.ru/v1/videos', {
    method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: 'avatar-iv', prompt: 'Animate the supplied portrait speaking the supplied Russian audio. Preserve the exact speech and voice. Natural restrained facial expression, accurate lip synchronization, static camera. No subtitles.', resolution: '720p', aspect_ratio: '9:16', duration: 5,
      input_references: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` } },
        { type: 'audio_url', audio_url: { url: `data:audio/wav;base64,${audio.toString('base64')}` } },
      ],
    }),
  });
  const job = await response.json();
  Object.assign(state, { createHTTP: response.status, id: job.id, status: job.status, error: safeError(job.error || job.detail || job.message) });
  await save(state);
}
console.log(JSON.stringify(state));
