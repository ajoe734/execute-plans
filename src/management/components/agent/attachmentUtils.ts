// Attachment helpers for Management AI composer.
// Pure client-side: file → base64, optional image down-scale for localStorage
// cache. No upload-to-storage; bytes are sent inline via /bff/management/nl/ask.

export interface ChatAttachment {
  kind: "image";
  mimeType: string;
  filename: string;
  sizeBytes: number;
  /** base64 WITHOUT the `data:...;base64,` prefix */
  dataBase64: string;
}

export const ATTACHMENT_LIMITS = {
  maxPerMessage: 4,
  maxSinglePixelBytes: 5 * 1024 * 1024, // 5MB
  maxTotalBytes: 15 * 1024 * 1024, // 15MB
  acceptedMimePrefix: "image/",
};

export const PER_TURN_CACHE_BUDGET = 800 * 1024; // 800KB
export const THUMBNAIL_MAX_DIM = 256;

export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function attachmentToDataUrl(a: ChatAttachment): string {
  return `data:${a.mimeType};base64,${a.dataBase64}`;
}

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
  return {
    kind: "image",
    mimeType: file.type || "image/png",
    filename: file.name || "image",
    sizeBytes: file.size,
    dataBase64: dataUrlToBase64(dataUrl),
  };
}

/** Resize an image attachment to a thumbnail (webp). Returns the original on failure. */
export async function compressToThumbnail(a: ChatAttachment): Promise<ChatAttachment> {
  if (typeof document === "undefined") return a;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = attachmentToDataUrl(a);
    });
    const scale = Math.min(1, THUMBNAIL_MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return a;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/webp", 0.72);
    const b64 = dataUrlToBase64(dataUrl);
    return {
      kind: "image",
      mimeType: "image/webp",
      filename: a.filename.replace(/\.[^.]+$/, "") + ".thumb.webp",
      sizeBytes: Math.floor((b64.length * 3) / 4),
      dataBase64: b64,
    };
  } catch {
    return a;
  }
}

export function validateNewFiles(
  current: ChatAttachment[],
  files: File[],
): { accepted: File[]; error: string | null } {
  const accepted: File[] = [];
  let totalBytes = current.reduce((s, a) => s + a.sizeBytes, 0);
  for (const f of files) {
    if (!f.type.startsWith(ATTACHMENT_LIMITS.acceptedMimePrefix)) {
      return { accepted, error: `只支援圖片：${f.name}` };
    }
    if (f.size > ATTACHMENT_LIMITS.maxSinglePixelBytes) {
      return { accepted, error: `單張超過 5MB：${f.name}` };
    }
    if (current.length + accepted.length + 1 > ATTACHMENT_LIMITS.maxPerMessage) {
      return { accepted, error: `一次最多 ${ATTACHMENT_LIMITS.maxPerMessage} 張` };
    }
    totalBytes += f.size;
    if (totalBytes > ATTACHMENT_LIMITS.maxTotalBytes) {
      return { accepted, error: "附件總大小超過 15MB" };
    }
    accepted.push(f);
  }
  return { accepted, error: null };
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
