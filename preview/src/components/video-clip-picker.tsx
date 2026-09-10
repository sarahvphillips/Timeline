import { useRef, useState } from "react";
import {
  downloadBlob,
  formatBytes,
  formatClock,
  makeTrimmedCopy,
  sha256Blob,
  sha256File,
  type VideoClipMeta,
} from "@/lib/checksum";

export function VideoClipPicker({
  onPicked,
}: {
  onPicked: (clip: VideoClipMeta) => void;
}) {
  const fileRef = useRef<File | null>(null);
  const [name, setName] = useState("");
  const [bytes, setBytes] = useState(0);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [originalSha, setOriginalSha] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    fileRef.current = file;
    setBusy(true);
    setError("");
    try {
      const hash = await sha256File(file);
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      const length = await new Promise<number>((resolve, reject) => {
        video.onloadedmetadata = () => resolve(video.duration || 0);
        video.onerror = () => reject(new Error("Could not read video length"));
        video.src = url;
      });
      URL.revokeObjectURL(url);
      setName(file.name);
      setBytes(file.size);
      setDuration(length);
      setStart(0);
      setEnd(length);
      setOriginalSha(hash);
    } catch {
      setError("Could not read that file. Original was not changed.");
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    const file = fileRef.current;
    if (!file || !originalSha) return;
    const clipStart = Math.min(start, end);
    const clipEnd = Math.max(start, end) || duration;
    setBusy(true);
    setError("");
    try {
      const copy = await makeTrimmedCopy(file, clipStart, clipEnd);
      const clipSha = await sha256Blob(copy);
      const clipName = `timeline-clip-${Date.now()}.webm`;
      downloadBlob(copy, clipName);
      onPicked({
        fileName: name,
        bytes,
        durationSec: duration,
        clipStart,
        clipEnd,
        sha256: clipSha,
        originalSha256: originalSha,
        clipSha256: clipSha,
        clipBytes: copy.size,
        clipFileName: clipName,
        savedCopy: true,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not make a clip copy. Original is unchanged.",
      );
      onPicked({
        fileName: name,
        bytes,
        durationSec: duration,
        clipStart,
        clipEnd,
        sha256: originalSha,
        originalSha256: originalSha,
        clipSha256: "",
        clipBytes: 0,
        clipFileName: "",
        savedCopy: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-radius border border-border bg-bg p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Phone / doorbell clip</p>
      <p className="text-xs text-muted">
        Original stays in your gallery. We make a <strong>new</strong> trimmed copy, checksum that copy
        (that is what you verify later), and also keep the original file’s checksum. This preview
        downloads the copy; the Expo app can save it straight to the gallery.
      </p>
      <label className="block text-sm text-muted">
        Choose video
        <input
          type="file"
          accept="video/*"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="mt-1 block w-full text-sm text-fg"
        />
      </label>
      {busy ? <p className="text-sm text-muted">Working — original is not being overwritten…</p> : null}
      {error ? <p className="text-sm text-primary">{error}</p> : null}
      {originalSha ? (
        <>
          <p className="text-sm">
            {name} · {formatBytes(bytes)} · {formatClock(duration)}
          </p>
          <p className="text-xs text-muted">Source checksum</p>
          <p className="break-all font-mono text-xs text-muted">{originalSha}</p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Clip start (seconds)
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={start}
              onChange={(e) => setStart(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Clip end (seconds)
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-radius border border-border bg-surface px-3 py-3 text-fg"
            />
          </label>
          <p className="text-xs text-muted">
            Copy range {formatClock(Math.min(start, end))} – {formatClock(Math.max(start, end) || duration)}.
          </p>
          <button type="button" onClick={keep} className="min-h-11 w-full rounded-radius bg-primary font-semibold text-bg">
            Make trimmed copy, checksum it, save
          </button>
        </>
      ) : (
        <p className="text-xs text-muted">
          Or record a new clip that starts when the driver is near and stops after drop-off — that file
          is already the clip, so one checksum is enough.
        </p>
      )}
    </div>
  );
}
