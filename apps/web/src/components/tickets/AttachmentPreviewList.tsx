"use client";

import { FileText } from "lucide-react";

export interface AttachmentPreviewItem {
  id: string;
  name?: string;
  originalFilename?: string;
  sizeLabel: string;
  mimeType: string;
  isInline?: boolean;
}

export function AttachmentPreviewList({
  attachments,
  onRemove
}: {
  attachments: AttachmentPreviewItem[];
  onRemove?: (attachmentId: string) => void;
}) {
  if (attachments.length === 0) {
    return <p className="muted">No attachments added.</p>;
  }

  return (
    <div className="attachment-list">
      {attachments.map((attachment) => (
        <div className="attachment-row" key={attachment.id}>
          <span>
            <FileText size={16} aria-hidden="true" /> {attachment.originalFilename ?? attachment.name}
            {attachment.isInline ? <span className="muted"> inline</span> : null}
          </span>
          <span className="muted">
            {attachment.mimeType} - {attachment.sizeLabel}
          </span>
          {onRemove ? (
            <button className="button ghost compact-button" type="button" onClick={() => onRemove(attachment.id)}>
              Remove
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
