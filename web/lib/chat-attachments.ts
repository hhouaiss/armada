'use client';

/**
 * Image attachments for agent chats.
 *
 * Images are downscaled in the browser before being sent over the gateway
 * WebSocket: models don't benefit from more than ~1568px on the long edge,
 * and it keeps the payload (and the stored conversation) small.
 */

export interface ChatImageAttachment {
  id: string;
  type: 'image';
  /** MIME type of the encoded payload. */
  mediaType: string;
  /** base64 payload, no data: prefix — what the gateway expects. */
  data: string;
  /** data: URL for rendering a preview. */
  url: string;
  name: string;
}

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MAX_ATTACHMENTS = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1568;

export function isSupportedImage(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type) || file.type === 'image/jpg';
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
}

/** Downscale to MAX_EDGE and re-encode as JPEG. Animated GIFs are left alone. */
async function downscale(dataUrl: string, mediaType: string): Promise<{ url: string; mediaType: string }> {
  if (mediaType === 'image/gif') return { url: dataUrl, mediaType };

  const img = await loadImage(dataUrl);
  const longEdge = Math.max(img.width, img.height);
  const needsResize = longEdge > MAX_EDGE;
  const tooHeavy = dataUrl.length * 0.75 > MAX_IMAGE_BYTES;
  if (!needsResize && !tooHeavy) return { url: dataUrl, mediaType };

  const scale = needsResize ? MAX_EDGE / longEdge : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { url: dataUrl, mediaType };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // PNG screenshots keep their alpha; photos go to JPEG for size.
  const outType = mediaType === 'image/png' ? 'image/png' : 'image/jpeg';
  return { url: canvas.toDataURL(outType, 0.85), mediaType: outType };
}

/**
 * Turn a picked/pasted/dropped file into a ready-to-send attachment.
 * Throws with a user-facing French message when the file can't be used.
 */
export async function fileToAttachment(file: File): Promise<ChatImageAttachment> {
  if (!isSupportedImage(file)) {
    throw new Error(`Format non supporté : ${file.name || file.type}. Utilisez JPEG, PNG, GIF ou WebP.`);
  }

  const original = await readAsDataUrl(file);
  const { url, mediaType } = await downscale(original, file.type === 'image/jpg' ? 'image/jpeg' : file.type);
  const data = url.split(',')[1] ?? '';

  if (data.length * 0.75 > MAX_IMAGE_BYTES) {
    throw new Error(`Image trop lourde : ${file.name}. Maximum 5 Mo.`);
  }

  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'image',
    mediaType,
    data,
    url,
    name: file.name || 'image',
  };
}

/** Extract image files from a paste or drop event's DataTransfer. */
export function imageFilesFrom(list: FileList | DataTransferItemList | null): File[] {
  if (!list) return [];
  const files: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const entry: any = (list as any)[i];
    const file: File | null = typeof entry.getAsFile === 'function' ? entry.getAsFile() : entry;
    if (file && file.type?.startsWith('image/')) files.push(file);
  }
  return files;
}

/** Shape stored in ChatMessage.metadata by the gateway, used to re-render history. */
export interface StoredAttachment {
  type: string;
  mediaType?: string;
  name?: string;
  url: string;
}

export function attachmentsFromMetadata(metadata: any): StoredAttachment[] {
  const list = metadata?.attachments;
  if (!Array.isArray(list)) return [];
  return list.filter((a: any) => a && typeof a.url === 'string');
}
