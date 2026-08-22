'use client';

import { ImagePlus, X } from 'lucide-react';
import { useRef } from 'react';
import {
  ChatImageAttachment,
  MAX_ATTACHMENTS,
  StoredAttachment,
} from '@/lib/chat-attachments';

/** Thumbnails of the images staged for the next message. */
export function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: ChatImageAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap mb-2">
      {attachments.map(att => (
        <div key={att.id} className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={att.url}
            alt={att.name}
            className="h-16 w-16 object-cover rounded-lg border border-[var(--armada-accent)]/60"
          />
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            aria-label={`Retirer ${att.name}`}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Button + hidden file input used to pick images. */
export function AttachButton({
  onFiles,
  disabled,
  count,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  count: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = count >= MAX_ATTACHMENTS;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={e => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || full}
        title={full ? `Maximum ${MAX_ATTACHMENTS} images` : 'Joindre une image'}
        aria-label="Joindre une image"
        className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--armada-accent)]/60 text-[var(--armada-text)]/50 hover:text-[var(--armada-text)] hover:border-[var(--armada-primary)]/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

/** Images rendered inside a message bubble (live or replayed from history). */
export function MessageImages({
  attachments,
}: {
  attachments: Array<ChatImageAttachment | StoredAttachment>;
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap mb-2">
      {attachments.map((att, i) => (
        <a
          key={`${att.url.slice(-24)}-${i}`}
          href={att.url}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={att.url}
            alt={att.name || 'image jointe'}
            className="max-h-48 max-w-[220px] rounded-lg border border-white/20 object-cover"
          />
        </a>
      ))}
    </div>
  );
}
