"use client";

import {
  Bold,
  Code,
  ChevronDown,
  Eye,
  Wand2,
  Italic,
  Link,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  RemoveFormatting,
  Send,
  Strikethrough,
  Underline
} from "lucide-react";
import { ClipboardEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AttachmentDropzone } from "./AttachmentDropzone";
import { AttachmentPreviewItem, AttachmentPreviewList } from "./AttachmentPreviewList";
import { SignatureInserter } from "./SignatureInserter";

const toolbar = [
  { label: "Bold", icon: Bold, command: "bold" },
  { label: "Italic", icon: Italic, command: "italic" },
  { label: "Underline", icon: Underline, command: "underline" },
  { label: "Strikethrough", icon: Strikethrough, command: "strikeThrough" },
  { label: "Ordered list", icon: ListOrdered, command: "insertOrderedList" },
  { label: "Unordered list", icon: List, command: "insertUnorderedList" },
  { label: "Quote", icon: Quote, command: "formatBlock", value: "blockquote" },
  { label: "Inline code", icon: Code, command: "formatBlock", value: "pre" },
  { label: "Remove formatting", icon: RemoveFormatting, command: "removeFormat" }
] as const;

type ComposerAction = "send" | "send_and_close" | "save_note" | "send_note" | "send_note_and_close";

interface UserSignature {
  htmlSignature: string;
  useSignatureByDefault: boolean;
}

interface TicketReplyEditorProps {
  ticketId?: string;
  notifyUsers?: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  ccUsers?: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  onSaved?: () => void | Promise<void>;
}

export function TicketReplyEditor({ ticketId, notifyUsers = [], ccUsers = [], onSaved }: TicketReplyEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"public" | "internal">("public");
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [preview, setPreview] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPreviewItem[]>([]);
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccUserIds, setCcUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<UserSignature>("/profile/signature")
      .then((signature) => {
        if (!mounted || !signature.useSignatureByDefault || !signature.htmlSignature.trim() || !editorRef.current) {
          return;
        }
        if (!editorRef.current.innerText.trim() && !editorRef.current.innerHTML.trim()) {
          editorRef.current.innerHTML = signature.htmlSignature;
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function insertHtml(html: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
  }

  function getEditorText() {
    return editorRef.current?.innerText.trim() ?? "";
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current?.contains(selection.anchorNode)) {
      return "";
    }

    return selection.toString().trim();
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(event.clipboardData.items);
    const images = items.filter((item) => item.type.startsWith("image/"));
    if (images.length === 0) {
      return;
    }

    event.preventDefault();
    images.forEach((item, index) => {
      const file = item.getAsFile();
      if (file) {
        void uploadPastedImage(file, index);
      }
    });
  }

  function changeMode(nextMode: "public" | "internal") {
    setMode(nextMode);
    setShowActionMenu(false);
  }

  function primaryAction(): ComposerAction {
    return mode === "public" ? "send" : "send_note";
  }

  async function submitMessage(selectedAction: ComposerAction = primaryAction()) {
    if (!ticketId || !editorRef.current) {
      return;
    }

    const bodyHtml = editorRef.current.innerHTML;
    const bodyText = editorRef.current.innerText.trim();
    if (!bodyText) {
      setError("Message body is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          visibility: mode,
          bodyHtml,
          bodyText,
          attachmentIds: attachments.map((attachment) => attachment.id),
          notifyUserIds,
          ccEmails,
          ccUserIds,
          action: selectedAction
        })
      });
      editorRef.current.innerHTML = "";
      setAttachments([]);
      setNotifyUserIds([]);
      setCcInput("");
      setCcEmails([]);
      setCcUserIds([]);
      setShowActionMenu(false);
      await onSaved?.();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`${mode === "public" ? "Unable to send reply." : "Unable to save note."}${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function closeTicket() {
    if (!ticketId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/tickets/${ticketId}/close`, { method: "POST" });
      setShowActionMenu(false);
      await onSaved?.();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to close ticket.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  function toggleNotifyUser(userId: string) {
    setNotifyUserIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function addCcToken(rawValue: string) {
    const token = rawValue.trim().replace(/,$/, "");
    if (!token) {
      return;
    }

    if (token.startsWith("@")) {
      const lookup = token.slice(1).toLowerCase();
      const matchedUser = ccUsers.find((user) =>
        `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(lookup)
      );
      if (matchedUser) {
        setCcUserIds((current) => (current.includes(matchedUser.id) ? current : [...current, matchedUser.id]));
        setCcInput("");
        return;
      }
      setError(`No internal user matched ${token}.`);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)) {
      setError("CC must be an email address or @internal user name.");
      return;
    }

    setCcEmails((current) => (current.includes(token.toLowerCase()) ? current : [...current, token.toLowerCase()]));
    setCcInput("");
  }

  function removeCcEmail(email: string) {
    setCcEmails((current) => current.filter((item) => item !== email));
  }

  function removeCcUser(userId: string) {
    setCcUserIds((current) => current.filter((item) => item !== userId));
  }

  async function uploadPastedImage(file: File, index: number) {
    if (!ticketId) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file, file.name || `pasted-image-${index + 1}.png`);
    const uploaded = await apiFetch<{
      id: string;
      originalFilename: string;
      mimeType: string;
      fileSize: number;
      isInline?: boolean;
    }>(`/tickets/${ticketId}/attachments`, {
      method: "POST",
      body: formData
    });

    setAttachments((current) => [
      ...current,
      {
        id: uploaded.id,
        originalFilename: uploaded.originalFilename,
        mimeType: uploaded.mimeType,
        sizeLabel: formatBytes(uploaded.fileSize),
        isInline: uploaded.isInline
      }
    ]);
  }

  async function removeAttachment(attachmentId: string) {
    if (ticketId) {
      await apiFetch(`/tickets/${ticketId}/attachments/${attachmentId}`, { method: "DELETE" });
    }
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  async function runAiAction(action: "paraphrase" | "improve-reply" | "suggest-reply") {
    if (!ticketId || !editorRef.current) {
      return;
    }

    const selectedText = action === "paraphrase" ? getSelectedText() : "";
    const draft = selectedText || getEditorText();
    if (action !== "suggest-reply" && !draft) {
      setError(action === "paraphrase" ? "Select text to paraphrase or write a draft first." : "Write a draft first.");
      return;
    }

    setAiBusy(action);
    setError(null);
    try {
      const result = await apiFetch<{ text: string }>(`/tickets/${ticketId}/ai/${action}`, {
        method: "POST",
        body: JSON.stringify({ draft })
      });

      if (selectedText) {
        document.execCommand("insertText", false, result.text);
      } else {
        editorRef.current.innerText = result.text;
      }
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to run AI writing tool.${detail ? ` ${detail}` : ""}`);
    } finally {
      setAiBusy(null);
    }
  }

  function actionLabel(selectedAction: ComposerAction) {
    switch (selectedAction) {
      case "send":
        return "Send";
      case "send_and_close":
        return "Send and Close";
      case "save_note":
        return "Save Note";
      case "send_note":
        return "Send Note";
      case "send_note_and_close":
        return "Send Note and Close";
    }
  }

  return (
    <div className="editor">
      <div className="editor-toolbar" aria-label="Reply tools">
        {toolbar.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="icon-button"
              type="button"
              title={item.label}
              aria-label={item.label}
              key={item.label}
              onClick={() => runCommand(item.command, "value" in item ? item.value : undefined)}
            >
              <Icon size={17} aria-hidden="true" />
            </button>
          );
        })}
        <button className="icon-button" type="button" title="Link" aria-label="Link" onClick={() => runCommand("createLink", "https://")}>
          <Link size={17} aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" title="Attach" aria-label="Attach">
          <Paperclip size={17} aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" title="Preview" aria-label="Preview" onClick={() => setPreview((value) => !value)}>
          <Eye size={17} aria-hidden="true" />
        </button>
        <button className="button secondary compact-button" type="button" onClick={() => runAiAction("paraphrase")} disabled={Boolean(aiBusy)}>
          <Wand2 size={15} aria-hidden="true" />
          <span>Paraphrase</span>
        </button>
        <button className="button secondary compact-button" type="button" onClick={() => runAiAction("improve-reply")} disabled={Boolean(aiBusy)}>
          <Wand2 size={15} aria-hidden="true" />
          <span>Rewrite Draft</span>
        </button>
        <button className="button secondary compact-button" type="button" onClick={() => runAiAction("suggest-reply")} disabled={Boolean(aiBusy)}>
          <Wand2 size={15} aria-hidden="true" />
          <span>Draft Reply</span>
        </button>
      </div>
      <div>
        <button className={`button ${mode === "public" ? "" : "secondary"}`} type="button" onClick={() => changeMode("public")}>
          Public Reply
        </button>{" "}
        <button className={`button ${mode === "internal" ? "" : "secondary"}`} type="button" onClick={() => changeMode("internal")}>
          Internal Note
        </button>
      </div>
      <div
        className="editor-surface signature-render"
        contentEditable={!preview}
        suppressContentEditableWarning
        ref={editorRef}
        onPaste={handlePaste}
        role="textbox"
        aria-label={mode === "public" ? "Public reply body" : "Internal note body"}
        data-placeholder={mode === "public" ? "Write a customer-facing reply..." : "Write an internal troubleshooting note..."}
      />
      {mode === "public" ? (
        <div className="cc-picker">
          <label className="field">
            <span>CC</span>
            <input
              className="input"
              value={ccInput}
              onChange={(event) => setCcInput(event.target.value)}
              onBlur={() => addCcToken(ccInput)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
                  event.preventDefault();
                  addCcToken(ccInput);
                }
              }}
              placeholder="Add email or @internal user"
              list="ticket-cc-users"
            />
            <datalist id="ticket-cc-users">
              {ccUsers.map((user) => (
                <option key={user.id} value={`@${user.firstName} ${user.lastName}`}>
                  {user.email}
                </option>
              ))}
            </datalist>
          </label>
          <div className="chip-row">
            {ccEmails.map((email) => (
              <button className="chip" type="button" key={email} onClick={() => removeCcEmail(email)}>
                {email} x
              </button>
            ))}
            {ccUserIds.map((userId) => {
              const user = ccUsers.find((item) => item.id === userId);
              return user ? (
                <button className="chip" type="button" key={userId} onClick={() => removeCcUser(userId)}>
                  {user.firstName} {user.lastName} x
                </button>
              ) : null;
            })}
          </div>
        </div>
      ) : null}
      <div className="grid columns-2">
        <AttachmentDropzone ticketId={ticketId} onUploaded={(attachment) => setAttachments((current) => [...current, attachment])} />
        <div className="panel">
          <h3>Attachments</h3>
          <AttachmentPreviewList attachments={attachments} onRemove={(attachmentId) => void removeAttachment(attachmentId)} />
        </div>
      </div>
      <div className="editor-toolbar">
        <SignatureInserter onInsert={insertHtml} />
        {notifyUsers.length ? (
          <div className="notify-picker">
            <strong>Notify</strong>
            {notifyUsers.map((user) => (
              <label key={user.id}>
                <input type="checkbox" checked={notifyUserIds.includes(user.id)} onChange={() => toggleNotifyUser(user.id)} />
                {user.firstName} {user.lastName}
              </label>
            ))}
          </div>
        ) : null}
        {error ? <span className="error">{error}</span> : null}
        <div className="split-action">
          <button className="button split-action-main" type="button" onClick={() => submitMessage()} disabled={saving || !ticketId}>
            <Send size={16} aria-hidden="true" />
            <span>{actionLabel(primaryAction())}</span>
          </button>
          <button
            className="button split-action-toggle"
            type="button"
            aria-label="More send actions"
            aria-expanded={showActionMenu}
            onClick={() => setShowActionMenu((current) => !current)}
            disabled={saving || !ticketId}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {showActionMenu ? (
            <div className="split-action-menu" role="menu">
              {mode === "public" ? (
                <>
                  <button type="button" role="menuitem" onClick={() => submitMessage("send_and_close")}>
                    Send and Close
                  </button>
                  <button type="button" role="menuitem" onClick={() => closeTicket()}>
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => submitMessage("save_note")}>
                    Save Note
                  </button>
                  <button type="button" role="menuitem" onClick={() => submitMessage("send_note_and_close")}>
                    Send Note and Close
                  </button>
                  <button type="button" role="menuitem" onClick={() => closeTicket()}>
                    Close
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  }

  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
