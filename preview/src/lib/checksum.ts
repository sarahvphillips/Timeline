import { nowStamp } from "@/lib/date-span";

export type ChecksumRow = {
  id: string;
  relatedKind: string;
  relatedId: string;
  href: string;
  label: string;
  sha256: string;
  bytes: number;
  durationSec: number;
  clipStart: number;
  clipEnd: number;
  at: string;
  action: "created" | "edited" | "file" | "file-original" | "file-clip";
};

export type VideoClipMeta = {
  fileName: string;
  bytes: number;
  durationSec: number;
  clipStart: number;
  clipEnd: number;
  sha256: string;
  originalSha256: string;
  clipSha256: string;
  clipBytes: number;
  clipFileName: string;
  savedCopy: boolean;
};

const STORE = "timeline-checksums-v1";

export async function sha256Buffer(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return sha256Buffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export async function sha256File(file: File): Promise<string> {
  return sha256Buffer(await file.arrayBuffer());
}

export async function sha256Blob(blob: Blob): Promise<string> {
  return sha256Buffer(await blob.arrayBuffer());
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** New file only. Original is not rewritten. Re-encodes in this preview (WebM). */
export async function makeTrimmedCopy(file: File, start: number, end: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read video"));
  });
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(video.duration || end, Math.max(start, end));
  video.currentTime = from;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });
  const stream =
    (
      video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      }
    ).captureStream?.() ||
    (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();
  if (!stream || typeof MediaRecorder === "undefined") {
    URL.revokeObjectURL(url);
    throw new Error("This browser cannot cut a copy. Expo app can save the clip to the gallery.");
  }
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  rec.start(80);
  await video.play();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (video.currentTime >= to - 0.05 || video.ended) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  video.pause();
  rec.stop();
  const blob = await done;
  URL.revokeObjectURL(url);
  if (!blob.size) throw new Error("Clip copy was empty.");
  return blob;
}

export function loadChecksums(): ChecksumRow[] {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return [];
    const list = JSON.parse(raw) as ChecksumRow[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveChecksums(list: ChecksumRow[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function logChecksum(row: Omit<ChecksumRow, "id" | "at"> & { at?: string }): ChecksumRow {
  const full: ChecksumRow = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: row.at || nowStamp(),
    relatedKind: row.relatedKind,
    relatedId: row.relatedId,
    href: row.href,
    label: row.label,
    sha256: row.sha256,
    bytes: row.bytes || 0,
    durationSec: row.durationSec || 0,
    clipStart: row.clipStart || 0,
    clipEnd: row.clipEnd || 0,
    action: row.action,
  };
  saveChecksums([full, ...loadChecksums()]);
  return full;
}

export function shortHash(sha: string): string {
  return sha ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : "";
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
