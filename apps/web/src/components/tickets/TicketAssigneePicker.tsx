"use client";

import { Check, ChevronDown, Search, UserRound, UserRoundPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface AssignableTicketUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  activeTicketCount?: number;
}

interface TicketAssigneePickerProps {
  users: AssignableTicketUser[];
  selectedIds: string[];
  currentUserId?: string;
  disabled?: boolean;
  onChange: (userIds: string[]) => void;
}

function initials(user: AssignableTicketUser) {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
}

export function TicketAssigneePicker({ users, selectedIds, currentUserId, disabled, onChange }: TicketAssigneePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedUsers = useMemo(() => selectedIds.map((id) => users.find((user) => user.id === id)).filter((user): user is AssignableTicketUser => Boolean(user)), [selectedIds, users]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => !query || `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(query));
  }, [search, users]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const toggle = (userId: string) => onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);

  return (
    <div className="ticket-assignee-picker" ref={containerRef}>
      <div className="ticket-assignee-chips">
        {selectedUsers.map((user) => <span className="ticket-assignee-chip" key={user.id}><span>{initials(user)}</span>{user.firstName} {user.lastName}<button type="button" onClick={() => toggle(user.id)} disabled={disabled} aria-label={`Remove ${user.firstName} ${user.lastName}`}><X size={12} aria-hidden="true" /></button></span>)}
        {!selectedUsers.length ? <span className="muted">Unassigned</span> : null}
      </div>
      <div className="ticket-assignee-controls">
        <button className="button secondary ticket-assignee-trigger" type="button" onClick={() => setOpen((current) => !current)} disabled={disabled} aria-expanded={open}>
          <UserRoundPlus size={15} aria-hidden="true" /><span>Add specialist</span><ChevronDown size={14} aria-hidden="true" />
        </button>
        {currentUserId && users.some((user) => user.id === currentUserId) && !selectedIds.includes(currentUserId) ? <button className="button secondary compact-button" type="button" onClick={() => onChange([...selectedIds, currentUserId])} disabled={disabled}>Assign to me</button> : null}
      </div>
      {open ? <div className="ticket-assignee-menu">
        <label className="ticket-assignee-search"><Search size={14} aria-hidden="true" /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search specialists" aria-label="Search specialists" /></label>
        <button className="ticket-assignee-option unassigned" type="button" onClick={() => { onChange([]); setOpen(false); }} disabled={disabled}><span className="ticket-assignee-avatar"><UserRound size={15} aria-hidden="true" /></span><span>Unassigned</span></button>
        <div className="ticket-assignee-options">
          {filteredUsers.map((user) => <button className={`ticket-assignee-option${selectedIds.includes(user.id) ? " selected" : ""}`} type="button" onClick={() => toggle(user.id)} disabled={disabled} key={user.id}>
            <span className="ticket-assignee-avatar">{initials(user)}</span><span><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></span><em title="Active tickets">{user.activeTicketCount ?? 0}</em>{selectedIds.includes(user.id) ? <Check size={14} aria-hidden="true" /> : null}
          </button>)}
          {!filteredUsers.length ? <span className="ticket-assignee-empty">No specialists found.</span> : null}
        </div>
      </div> : null}
    </div>
  );
}
