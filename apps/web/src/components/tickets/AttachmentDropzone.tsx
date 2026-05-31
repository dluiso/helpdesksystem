"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { Paperclip, UploadCloud } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AttachmentPreviewItem } from "./AttachmentPreviewList";

interface AttachmentDropzoneProps {
  ticketId?: string;
  onUploaded: (attachment: AttachmentPreviewItem) => void;
}

export function AttachmentDropzone({ ticketId, onUploaded }: AttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    if (!ticketId || files.length === 0) {
      return;
    }

    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const uploaded = await apiFetch<ServerAttachment>(`/tickets/${ticketId}/attachments`, {
          method: "POST",
          body: formData
        });
        onUploaded(toPreviewItem(uploaded));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to upload attachment.");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void uploadFiles(event.target.files);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void uploadFiles(event.dataTransfer.files);
  }

  return (
    <div
      className="dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" multiple hidden onChange={handleInputChange} />
      <div>
        {uploading ? <UploadCloud size={20} aria-hidden="true" /> : <Paperclip size={20} aria-hidden="true" />}
        <div>{uploading ? "Uploading..." : "Drop files here or click to attach"}</div>
        {error ? <div className="error">{error}</div> : null}
      </div>
    </div>
  );
}

interface ServerAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  isInline?: boolean;
}

function toPreviewItem(attachment: ServerAttachment): AttachmentPreviewItem {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeLabel: formatBytes(attachment.fileSize),
    isInline: attachment.isInline
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
