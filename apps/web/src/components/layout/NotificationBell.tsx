"use client";

import { Bell, CheckCheck, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  status: "UNREAD" | "READ";
  createdAt: string;
  ticket: { id: string; ticketNumber: string; subject: string } | null;
}

interface NotificationPreferences {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  ticketAssignedToMe: boolean;
  ticketAssignedToMyTeam: boolean;
  ticketReplyOnAssignedTicket: boolean;
  internalNoteOnAssignedTicket: boolean;
  internalNoteMention: boolean;
  routingRuleMatched: boolean;
  ticketReopened: boolean;
  dailyDigestEnabled: boolean;
}

const preferenceLabels: Array<{ key: keyof NotificationPreferences; label: string }> = [
  { key: "inAppEnabled", label: "In-app notifications" },
  { key: "emailEnabled", label: "Email notifications" },
  { key: "ticketAssignedToMe", label: "Tickets assigned to me" },
  { key: "ticketAssignedToMyTeam", label: "Tickets assigned to my team" },
  { key: "ticketReplyOnAssignedTicket", label: "Replies on assigned tickets" },
  { key: "internalNoteOnAssignedTicket", label: "Internal notes on assigned tickets" },
  { key: "internalNoteMention", label: "Internal note mentions" },
  { key: "routingRuleMatched", label: "Routing rule matches" },
  { key: "ticketReopened", label: "Reopened tickets" },
  { key: "dailyDigestEnabled", label: "Daily digest" }
];

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [open, setOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((item) => item.status === "UNREAD").length;

  async function load() {
    try {
      const [notificationData, preferenceData] = await Promise.all([
        apiFetch<NotificationItem[]>("/notifications"),
        apiFetch<NotificationPreferences>("/notification-preferences/me")
      ]);
      setItems(notificationData);
      setPreferences(preferenceData);
    } catch {
      setItems([]);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!preferences) {
      return;
    }

    const next = { ...preferences, [key]: value };
    setPreferences(next);
    await apiFetch("/notification-preferences/me", {
      method: "PATCH",
      body: JSON.stringify({ [key]: value })
    });
  }

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="notification-menu" ref={panelRef}>
      <button className="notification-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-label="Notifications">
        <Bell size={17} aria-hidden="true" />
        {unreadCount > 0 ? <span>{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <strong>{showPreferences ? "Notification Preferences" : "Notifications"}</strong>
            <div className="form-actions">
              <button className="icon-button" type="button" onClick={() => setShowPreferences((current) => !current)} title="Preferences">
                <Settings2 size={15} aria-hidden="true" />
              </button>
              {!showPreferences ? (
                <button className="icon-button" type="button" onClick={markAllRead} disabled={busy} title="Mark all read">
                  <CheckCheck size={15} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
          {showPreferences ? (
            <div className="notification-preferences">
              {preferences
                ? preferenceLabels.map((item) => (
                    <label className="checkbox-row" key={item.key}>
                      <input type="checkbox" checked={preferences[item.key]} onChange={(event) => void updatePreference(item.key, event.target.checked)} />
                      {item.label}
                    </label>
                  ))
                : <p className="muted">Loading preferences...</p>}
            </div>
          ) : (
            <div className="notification-list">
              {items.length === 0 ? <p className="muted">No notifications yet.</p> : null}
              {items.map((item) => (
                <Link className={`notification-item ${item.status === "UNREAD" ? "unread" : ""}`} href={item.ticket ? `/tickets/${item.ticket.id}` : "#"} key={item.id}>
                  <strong>{item.title}</strong>
                  {item.body ? <span>{item.body}</span> : null}
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
