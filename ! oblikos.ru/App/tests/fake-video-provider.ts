import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { VideoProvider, VideoInput, VideoJob } from "../src/features/ai/video-types";
export class FakeVideoProvider implements VideoProvider {
  requests: VideoInput[] = [];
  polls = 0;
  downloads = 0;
  jobs = new Map<string, VideoJob>();
  onCreate?: (input: VideoInput) => Promise<VideoJob>;
  onStatus?: (id: string) => Promise<VideoJob>;
  onDownload?: () => Promise<{ bytes: Buffer; mimeType: string }>;
  configuration() { return { provider: "fake-video", model: "offline-video" }; }
  async capabilities() { return { referenceImages: true, durations: [4, 6, 8], aspectRatios: ["16:9", "9:16"] }; }
  async createVideo(input: VideoInput) {
    this.requests.push(input);
    const job = this.onCreate ? await this.onCreate(input) : { id: randomUUID(), status: "PENDING" as const };
    this.jobs.set(job.id, job); return job;
  }
  async getVideoStatus(id: string) { this.polls++; return this.onStatus ? this.onStatus(id) : this.jobs.get(id)!; }
  async downloadVideo() { this.downloads++; return this.onDownload ? this.onDownload() : { bytes: await readFile(new URL("./fixtures/video.mp4", import.meta.url)), mimeType: "video/mp4" }; }
}
