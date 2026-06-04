"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Eye, GitMerge, RefreshCcw, Save, Search, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiBaseUrl, apiFetch } from "@/lib/api";
import { TicketReplyEditor } from "./TicketReplyEditor";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
}

interface TicketTeam {
  id: string;
  name: string;
  isActive: boolean;
}

interface TicketMessage {
  id: string;
  direction: string;
  visibility: string;
  bodyText: string;
  sanitizedBodyHtml: string | null;
  senderEmail: string | null;
  createdAt: string;
  mergedFromTicketId: string | null;
  mergedFromTicketNumber: string | null;
  mergedFromTicketSubject: string | null;
  authorUser: User | null;
  authorContact: { firstName: string; lastName: string; email: string } | null;
  attachments: TicketAttachment[];
}

interface MergedTicketReference {
  id: string;
  ticketNumber: string;
  subject: string;
  status?: string;
  mergedAt?: string | null;
}

interface MergeCandidate extends MergedTicketReference {
  status: string;
  priority: string;
  createdAt: string;
  clientId: string | null;
  client: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string; email: string } | null;
  senderEmail: string | null;
  _count: { messages: number; attachments: number };
}

interface TicketAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  isInline: boolean;
  contentId: string | null;
  scanStatus: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  senderEmail: string | null;
  senderDomain: string | null;
  client: { name: string } | null;
  contact: { firstName: string; lastName: string; email: string } | null;
  assignedUserId: string | null;
  assignedGroupId: string | null;
  assignedTeamId: string | null;
  assignedUser: User | null;
  assignees: Array<{ user: User }>;
  assignedGroup: Group | null;
  assignedTeam: TicketTeam | null;
  watchers: Array<{ user: User }>;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
  mergedIntoTicket: MergedTicketReference | null;
  mergedTickets: MergedTicketReference[];
  mergedAt: string | null;
  mergeReason: string | null;
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function TicketDetailWorkspace({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [ticketTeams, setTicketTeams] = useState<TicketTeam[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [assignedTeamId, setAssignedTeamId] = useState("");
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([]);
  const [mergeReason, setMergeReason] = useState("");
  const [mergeAllowDifferentClient, setMergeAllowDifferentClient] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeSearchBusy, setMergeSearchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requester = useMemo(() => {
    if (!ticket) {
      return "Unknown";
    }
    return ticket.contact ? `${ticket.contact.firstName} ${ticket.contact.lastName}` : ticket.senderEmail ?? "Unknown";
  }, [ticket]);
  const isMergedTicket = ticket?.status === "MERGED";
  const selectedMergeTickets = useMemo(() => selectedMergeIds.map((id) => mergeCandidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is MergeCandidate => Boolean(candidate)), [selectedMergeIds, mergeCandidates]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ticketData, userData, teamData] = await Promise.all([
        apiFetch<Ticket>(`/tickets/${ticketId}`),
        apiFetch<User[]>("/users"),
        apiFetch<TicketTeam[]>("/ticket-teams")
      ]);
      setTicket(ticketData);
      if (ticketData.ticketNumber && ticketId !== ticketData.ticketNumber) {
        router.replace(`/tickets/${ticketData.ticketNumber}`);
      }
      setUsers(userData);
      setTicketTeams(teamData);
      setAssignedUserIds(ticketData.assignees?.length ? ticketData.assignees.map((assignment) => assignment.user.id) : ticketData.assignedUserId ? [ticketData.assignedUserId] : []);
      setAssignedTeamId(ticketData.assignedTeamId ?? "");
      setWatcherIds(ticketData.watchers.map((watcher) => watcher.user.id));
    } catch {
      setError("Unable to load ticket.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/tickets/${ticketId}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedUserId: assignedUserIds[0] ?? null,
          assignedUserIds,
          assignedTeamId: assignedTeamId || null
        })
      });
      await apiFetch(`/tickets/${ticketId}/watchers`, {
        method: "PATCH",
        body: JSON.stringify({ userIds: watcherIds })
      });
      await load();
    } catch {
      setError("Unable to save assignment.");
    } finally {
      setSaving(false);
    }
  }

  function toggleWatcher(userId: string) {
    setWatcherIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function toggleAssignee(userId: string) {
    setAssignedUserIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function toggleMergeCandidate(ticketId: string) {
    setSelectedMergeIds((current) => (current.includes(ticketId) ? current.filter((id) => id !== ticketId) : [...current, ticketId]));
  }

  function openMergeModal() {
    setMergeSearch("");
    setMergeCandidates([]);
    setSelectedMergeIds([]);
    setMergeReason("");
    setMergeAllowDifferentClient(false);
    setShowMergeModal(true);
  }

  async function loadMergeCandidates(searchValue = mergeSearch) {
    if (!searchValue.trim()) {
      setMergeCandidates([]);
      return;
    }

    setMergeSearchBusy(true);
    setError(null);
    try {
      const candidates = await apiFetch<MergeCandidate[]>(`/tickets/${ticketId}/merge-candidates?search=${encodeURIComponent(searchValue.trim())}`);
      setMergeCandidates(candidates);
      setSelectedMergeIds((current) => current.filter((id) => candidates.some((candidate) => candidate.id === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search merge candidates.");
    } finally {
      setMergeSearchBusy(false);
    }
  }

  async function mergeTickets() {
    if (selectedMergeIds.length === 0) {
      setError("Choose at least one ticket to merge into this ticket.");
      return;
    }

    setMergeBusy(true);
    setError(null);
    try {
      const updatedTicket = await apiFetch<Ticket>(`/tickets/${ticketId}/merge`, {
        method: "POST",
        body: JSON.stringify({
          sourceTicketIds: selectedMergeIds,
          reason: mergeReason.trim() || undefined,
          allowDifferentClient: mergeAllowDifferentClient
        })
      });
      setTicket(updatedTicket);
      setShowMergeModal(false);
      setSelectedMergeIds([]);
      setMergeCandidates([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to merge tickets.");
    } finally {
      setMergeBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [ticketId]);

  useEffect(() => {
    if (!showMergeModal || mergeSearch.trim().length < 2) {
      setMergeCandidates([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadMergeCandidates(mergeSearch);
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMergeModal, mergeSearch]);

  if (loading) {
    return <div className="panel">Loading ticket...</div>;
  }

  if (!ticket) {
    return <div className="error-banner">{error ?? "Ticket was not found."}</div>;
  }
  const realAttachments = ticket.attachments.filter((attachment) => !isInlineEmailAsset(attachment));
  const inlineImageCount = ticket.attachments.filter((attachment) => isInlineEmailAsset(attachment)).length;
  const ticketRef = ticket.ticketNumber;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ticket {ticket.ticketNumber}</h1>
          <p className="muted">
            {ticket.client?.name ?? (ticket.senderDomain ? `Unmapped: ${ticket.senderDomain}` : "Unassigned")} - {requester}
          </p>
        </div>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={load}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          {!isMergedTicket ? (
            <button className="button secondary" type="button" onClick={openMergeModal}>
              <GitMerge size={16} aria-hidden="true" />
              <span>Merge</span>
            </button>
          ) : null}
          <button className="button secondary" type="button">
            <Sparkles size={16} aria-hidden="true" />
            <span>AI Assist</span>
          </button>
        </div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {isMergedTicket ? (
        <div className="info-banner">
          This ticket was merged{ticket.mergedIntoTicket ? " into " : "."}
          {ticket.mergedIntoTicket ? (
            <>
              {" "}
              <Link href={`/tickets/${ticket.mergedIntoTicket.ticketNumber}`}>{ticket.mergedIntoTicket.ticketNumber}</Link>. Replies should be sent from the primary ticket.
            </>
          ) : null}
        </div>
      ) : null}
      <section className="ticket-detail-layout">
        <div className="grid">
          {!isMergedTicket ? (
            <div className="panel">
              <h2>Reply Composer</h2>
              <TicketReplyEditor ticketId={ticketRef} notifyUsers={users} ccUsers={users} onSaved={load} />
            </div>
          ) : null}
          <div className="panel">
            <h2>Conversation</h2>
            <p className="muted">Newest messages appear first.</p>
            <div className="timeline">
              {ticket.messages.length === 0 ? <p className="muted">No messages yet.</p> : null}
              {[...ticket.messages].reverse().map((message) => (
                <article className={`message ${message.visibility === "INTERNAL" ? "internal" : ""}`} key={message.id}>
                  <header className="message-header">
                    <div>
                      <strong>
                        {message.direction === "INBOUND"
                          ? message.authorContact
                            ? `${message.authorContact.firstName} ${message.authorContact.lastName}`
                            : message.senderEmail ?? "Customer"
                          : message.authorUser
                            ? `${message.authorUser.firstName} ${message.authorUser.lastName}`
                            : "Technician"}
                      </strong>
                      <span className="muted"> {label(message.direction)} - {label(message.visibility)}</span>
                    </div>
                    <span className="muted">{new Date(message.createdAt).toLocaleString()}</span>
                  </header>
                  {message.mergedFromTicketNumber ? (
                    <div className="merge-origin-badge">
                      <GitMerge size={14} aria-hidden="true" />
                      <span>
                        Merged from {message.mergedFromTicketNumber}
                        {message.mergedFromTicketSubject ? ` - ${message.mergedFromTicketSubject}` : ""}
                      </span>
                    </div>
                  ) : null}
                  {message.sanitizedBodyHtml ? (
                    <div
                      className="message-body"
                      dangerouslySetInnerHTML={{ __html: renderMessageHtml(ticketRef, message.sanitizedBodyHtml, mergeAttachments(message.attachments, ticket.attachments)) }}
                    />
                  ) : (
                    <p>{message.bodyText}</p>
                  )}
                  <MessageAttachments
                    ticketId={ticketRef}
                    attachments={message.attachments.filter((attachment) => !isInlineEmailAsset(attachment))}
                    variant="message"
                  />
                </article>
              ))}
            </div>
          </div>
        </div>
        <aside className="ticket-side-panel">
          <div className="panel ticket-tools-panel">
            <h3>Ticket Tools</h3>
            <button className="button secondary full-width-button" type="button" onClick={openMergeModal} disabled={isMergedTicket}>
              <GitMerge size={16} aria-hidden="true" />
              <span>Merge Tickets</span>
            </button>
            {isMergedTicket && ticket.mergedIntoTicket ? (
              <Link className="button secondary full-width-button" href={`/tickets/${ticket.mergedIntoTicket.ticketNumber}`}>
                <ExternalLink size={16} aria-hidden="true" />
                <span>Open Primary</span>
              </Link>
            ) : null}
          </div>
          <div className="panel ticket-summary-panel">
            <h3>Ticket Details</h3>
            <dl className="detail-list">
              <div><dt>Status</dt><dd>{label(ticket.status)}</dd></div>
              <div><dt>Priority</dt><dd>{label(ticket.priority)}</dd></div>
              <div><dt>Source</dt><dd>{label(ticket.source)}</dd></div>
              <div><dt>Sender</dt><dd>{ticket.senderEmail ?? "Not set"}</dd></div>
              <div><dt>Inline images</dt><dd>{inlineImageCount}</dd></div>
              <div><dt>Files</dt><dd>{realAttachments.length}</dd></div>
              {ticket.mergedAt ? <div><dt>Merged</dt><dd>{new Date(ticket.mergedAt).toLocaleString()}</dd></div> : null}
            </dl>
          </div>
          {ticket.mergedTickets.length > 0 ? (
            <div className="panel">
              <h3>Merged Tickets</h3>
              <div className="merge-reference-list">
                {ticket.mergedTickets.map((mergedTicket) => (
                  <Link className="merge-reference-card" href={`/tickets/${mergedTicket.ticketNumber}`} key={mergedTicket.id}>
                    <strong>{mergedTicket.ticketNumber}</strong>
                    <span>{mergedTicket.subject}</span>
                    <span className="muted">{mergedTicket.mergedAt ? new Date(mergedTicket.mergedAt).toLocaleString() : "Merged"}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <form className="panel form" onSubmit={saveAssignment}>
            <h3>Assignment</h3>
            <label className="field">
              <span>Specialists</span>
              <div className="checkbox-row vertical">
                {users.map((user) => (
                  <label key={user.id}>
                    <input type="checkbox" checked={assignedUserIds.includes(user.id)} onChange={() => toggleAssignee(user.id)} />
                    {user.firstName} {user.lastName}
                  </label>
                ))}
              </div>
            </label>
            <label className="field">
              <span>Ticket Team</span>
              <select className="input" value={assignedTeamId} onChange={(event) => setAssignedTeamId(event.target.value)}>
                <option value="">No team</option>
                {ticketTeams.filter((team) => team.isActive).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Notify / Watchers</span>
              <div className="checkbox-row vertical">
                {users.map((user) => (
                  <label key={user.id}>
                    <input type="checkbox" checked={watcherIds.includes(user.id)} onChange={() => toggleWatcher(user.id)} />
                    {user.firstName} {user.lastName}
                  </label>
                ))}
              </div>
            </div>
            <button className="button" type="submit" disabled={saving}>
              <Save size={16} aria-hidden="true" />
              <span>Save Assignment</span>
            </button>
          </form>
          <div className="panel">
            <div className="section-heading compact-heading">
              <div>
                <h3>Ticket Files</h3>
                <p className="muted">Files attached to messages. Inline email images are shown inside the conversation.</p>
              </div>
            </div>
            <MessageAttachments ticketId={ticketRef} attachments={realAttachments} variant="sidebar" />
          </div>
        </aside>
      </section>
      {showMergeModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="ticket-detail-merge-modal-title">
            <div className="modal-header">
              <div>
                <h2 id="ticket-detail-merge-modal-title">Merge Into {ticket.ticketNumber}</h2>
                <p className="muted">Search tickets by number, subject, client, domain, or requester. Selected tickets will be moved into this ticket.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowMergeModal(false)} aria-label="Close merge dialog">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <label className="input-with-icon merge-search-field">
              <Search size={16} aria-hidden="true" />
              <input value={mergeSearch} onChange={(event) => setMergeSearch(event.target.value)} placeholder="Search tickets to merge" />
            </label>
            <div className="merge-candidate-list">
              {mergeSearchBusy ? <p className="muted">Searching tickets...</p> : null}
              {!mergeSearchBusy && mergeSearch.trim().length >= 2 && mergeCandidates.length === 0 ? <p className="muted">No merge candidates found.</p> : null}
              {!mergeSearchBusy && mergeSearch.trim().length < 2 ? <p className="muted">Type at least 2 characters to search.</p> : null}
              {mergeCandidates.map((candidate) => (
                <label className="merge-candidate-card" key={candidate.id}>
                  <input type="checkbox" checked={selectedMergeIds.includes(candidate.id)} onChange={() => toggleMergeCandidate(candidate.id)} />
                  <span className="merge-candidate-main">
                    <strong>{candidate.ticketNumber} - {candidate.subject}</strong>
                    <span>{candidate.client?.name ?? "Unassigned"} - {candidate.contact ? `${candidate.contact.firstName} ${candidate.contact.lastName}` : candidate.senderEmail ?? "Unknown requester"}</span>
                    <span className="muted">{label(candidate.status ?? "OPEN")} - {candidate._count.messages} messages - {candidate._count.attachments} files</span>
                  </span>
                </label>
              ))}
            </div>
            {selectedMergeTickets.length > 0 ? (
              <div className="merge-selection-summary">
                <strong>{selectedMergeTickets.length} selected</strong>
                <span>{selectedMergeTickets.map((candidate) => candidate.ticketNumber).join(", ")}</span>
              </div>
            ) : null}
            <label className="field">
              <span>Merge reason</span>
              <textarea className="input" rows={3} value={mergeReason} onChange={(event) => setMergeReason(event.target.value)} placeholder="Optional internal note" />
            </label>
            <label className="checkbox-card">
              <input type="checkbox" checked={mergeAllowDifferentClient} onChange={(event) => setMergeAllowDifferentClient(event.target.checked)} />
              <span>Allow merge if selected tickets belong to different clients</span>
            </label>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowMergeModal(false)} disabled={mergeBusy}>
                Cancel
              </button>
              <button className="button" type="button" onClick={mergeTickets} disabled={mergeBusy || selectedMergeIds.length === 0}>
                <GitMerge size={16} aria-hidden="true" />
                <span>{mergeBusy ? "Merging..." : "Merge Tickets"}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MessageAttachments({
  ticketId,
  attachments,
  variant
}: {
  ticketId: string;
  attachments: TicketAttachment[];
  variant: "message" | "sidebar";
}) {
  const visibleAttachments = attachments.filter((attachment) => attachment.scanStatus !== "BLOCKED" && attachment.scanStatus !== "SUSPICIOUS");
  if (visibleAttachments.length === 0) {
    return variant === "sidebar" ? <p className="muted">No files attached.</p> : null;
  }

  return (
    <div className={`message-attachments ${variant === "sidebar" ? "sidebar-attachments" : ""}`}>
      {variant === "message" ? (
        <div className="attachment-group-heading">
          <strong>{visibleAttachments.length} attachment{visibleAttachments.length === 1 ? "" : "s"}</strong>
        </div>
      ) : null}
      {visibleAttachments.map((attachment) => {
        const previewUrl = `${apiBaseUrl}/tickets/${ticketId}/attachments/${attachment.id}/preview`;
        const downloadUrl = `${apiBaseUrl}/tickets/${ticketId}/attachments/${attachment.id}/download`;
        const canPreviewImage = attachment.mimeType.startsWith("image/");

        return (
          <div className={`message-attachment-card ${variant === "sidebar" ? "sidebar-file-card" : ""}`} key={attachment.id}>
            <div className="attachment-main">
              <strong>{attachment.originalFilename}</strong>
              <div className="muted">
                {attachment.mimeType} - {formatBytes(attachment.fileSize)}
              </div>
              {canPreviewImage && variant === "message" ? <img className="attachment-image-preview" src={previewUrl} alt={attachment.originalFilename} /> : null}
            </div>
            <div className="attachment-actions">
              {canPreview(attachment.mimeType) ? (
                <a className="icon-button" href={previewUrl} target="_blank" rel="noreferrer" title="Preview" aria-label={`Preview ${attachment.originalFilename}`}>
                  <Eye size={16} aria-hidden="true" />
                </a>
              ) : null}
              <a className="icon-button" href={downloadUrl} title="Download" aria-label={`Download ${attachment.originalFilename}`}>
                <Download size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderMessageHtml(ticketId: string, html: string, attachments: TicketAttachment[]) {
  const inlineAttachments = attachments.filter((attachment) => isInlineEmailAsset(attachment) && canPreview(attachment.mimeType));
  const usedAttachmentIds = new Set<string>();

  return html.replace(/src=(["'])cid:([^"']+)\1/gi, (match, quote: string, rawContentId: string) => {
    const attachment = findInlineAttachment(rawContentId, inlineAttachments, usedAttachmentIds);
    if (attachment) {
      usedAttachmentIds.add(attachment.id);
    }
    return attachment ? `src=${quote}${apiBaseUrl}/tickets/${ticketId}/attachments/${attachment.id}/preview${quote}` : match;
  });
}

function mergeAttachments(primary: TicketAttachment[], fallback: TicketAttachment[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((attachment) => {
    if (seen.has(attachment.id)) {
      return false;
    }

    seen.add(attachment.id);
    return true;
  });
}

function cleanContentId(value: string | null) {
  return value?.trim().replace(/^cid:/i, "").replace(/^<|>$/g, "").replace(/^["']|["']$/g, "").toLowerCase() ?? "";
}

function isInlineEmailAsset(attachment: TicketAttachment) {
  return attachment.isInline || Boolean(attachment.contentId);
}

function findInlineAttachment(rawContentId: string, attachments: TicketAttachment[], usedAttachmentIds: Set<string>) {
  const normalizedContentId = cleanContentId(rawContentId);
  const available = attachments.filter((attachment) => !usedAttachmentIds.has(attachment.id));

  return (
    available.find((attachment) => cleanContentId(attachment.contentId) === normalizedContentId) ??
    available.find((attachment) => normalizedContentId.includes(attachment.originalFilename.toLowerCase())) ??
    available.find((attachment) => attachment.originalFilename.toLowerCase().includes(normalizedContentId)) ??
    available[0] ??
    null
  );
}

function canPreview(mimeType: string) {
  return ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"].includes(mimeType);
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
