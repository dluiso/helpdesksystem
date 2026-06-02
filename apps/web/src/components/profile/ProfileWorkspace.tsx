"use client";

import { Bold, Eye, Italic, KeyRound, Link, List, ListOrdered, Mail, PenLine, RemoveFormatting, Save, Strikethrough, Underline, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type ProfileSection = "account" | "password" | "notifications" | "signature";

interface ProfileUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  forcePasswordChange: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  groups: Array<{
    group: {
      id: string;
      name: string;
      roles: Array<{ role: { id: string; name: string } }>;
    };
  }>;
}

interface NotificationPreference {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  ticketAssignedToMe: boolean;
  ticketAssignedToMyTeam: boolean;
  ticketReplyOnAssignedTicket: boolean;
  internalNoteOnAssignedTicket: boolean;
  internalNoteMention: boolean;
  routingRuleMatched: boolean;
  ticketReopened: boolean;
  newTicketCreated: boolean;
  dailyDigestEnabled: boolean;
}

interface UserSignature {
  htmlSignature: string;
  plainTextSignature: string;
  useSignatureByDefault: boolean;
}

interface ProfileResponse {
  user: ProfileUser;
  notificationPreference: NotificationPreference;
  signature: UserSignature;
}

const NOTIFICATION_FIELDS: Array<{ key: keyof NotificationPreference; label: string }> = [
  { key: "newTicketCreated", label: "New ticket created" },
  { key: "ticketAssignedToMe", label: "Assigned to me" },
  { key: "ticketAssignedToMyTeam", label: "Assigned to my team" },
  { key: "ticketReplyOnAssignedTicket", label: "Reply on assigned ticket" },
  { key: "internalNoteOnAssignedTicket", label: "Internal note on assigned ticket" },
  { key: "internalNoteMention", label: "Mentioned on internal note" },
  { key: "routingRuleMatched", label: "Routing rule matched" },
  { key: "ticketReopened", label: "Ticket reopened" }
];

const SECTIONS: Array<{ key: ProfileSection; label: string; icon: typeof UserRound }> = [
  { key: "account", label: "Account", icon: UserRound },
  { key: "password", label: "Password", icon: KeyRound },
  { key: "notifications", label: "Notifications", icon: Mail },
  { key: "signature", label: "Signature", icon: PenLine }
];

const SIGNATURE_TOOLBAR = [
  { label: "Bold", icon: Bold, command: "bold" },
  { label: "Italic", icon: Italic, command: "italic" },
  { label: "Underline", icon: Underline, command: "underline" },
  { label: "Strikethrough", icon: Strikethrough, command: "strikeThrough" },
  { label: "Ordered list", icon: ListOrdered, command: "insertOrderedList" },
  { label: "Unordered list", icon: List, command: "insertUnorderedList" },
  { label: "Remove formatting", icon: RemoveFormatting, command: "removeFormat" }
] as const;

export function ProfileWorkspace() {
  const [activeSection, setActiveSection] = useState<ProfileSection>("account");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notificationDraft, setNotificationDraft] = useState<NotificationPreference | null>(null);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [useSignatureByDefault, setUseSignatureByDefault] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const signatureEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    setError(null);
    const response = await apiFetch<ProfileResponse>("/profile");
    setProfile(response);
    setFirstName(response.user.firstName);
    setLastName(response.user.lastName);
    setNotificationDraft(response.notificationPreference);
    setSignatureHtml(response.signature.htmlSignature);
    setUseSignatureByDefault(response.signature.useSignatureByDefault);
  }

  const roles = useMemo(() => {
    const names = new Set<string>();
    profile?.user.groups.forEach((membership) => {
      membership.group.roles.forEach((roleMembership) => names.add(roleMembership.role.name));
    });
    return [...names];
  }, [profile?.user.groups]);

  async function saveAccount() {
    setBusy("account");
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName })
      });
      setMessage("Profile information saved.");
      await loadProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save profile information.");
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    setBusy("password");
    setError(null);
    setMessage(null);
    try {
      if (newPassword !== confirmPassword) {
        throw new Error("The new password confirmation does not match.");
      }
      await apiFetch("/profile/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change password.");
    } finally {
      setBusy(null);
    }
  }

  async function saveNotifications() {
    if (!notificationDraft) {
      return;
    }
    setBusy("notifications");
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch<NotificationPreference>("/notification-preferences/me", {
        method: "PATCH",
        body: JSON.stringify(notificationDraft)
      });
      setNotificationDraft(response);
      setMessage("Notification preferences saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save notification preferences.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSignature() {
    const htmlSignature = signatureEditorRef.current?.innerHTML ?? signatureHtml;
    setBusy("signature");
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch<UserSignature>("/profile/signature", {
        method: "PATCH",
        body: JSON.stringify({ htmlSignature, useSignatureByDefault })
      });
      setSignatureHtml(response.htmlSignature);
      setUseSignatureByDefault(response.useSignatureByDefault);
      if (signatureEditorRef.current) {
        signatureEditorRef.current.innerHTML = response.htmlSignature;
      }
      setMessage("Signature saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save signature.");
    } finally {
      setBusy(null);
    }
  }

  function updateNotificationDraft(key: keyof NotificationPreference, value: boolean) {
    setNotificationDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function runSignatureCommand(command: string, value?: string) {
    signatureEditorRef.current?.focus();
    document.execCommand(command, false, value);
    setSignatureHtml(signatureEditorRef.current?.innerHTML ?? signatureHtml);
  }

  function addSignatureLink() {
    const href = window.prompt("Link URL");
    if (!href) {
      return;
    }
    runSignatureCommand("createLink", href);
  }

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>Profile</h1>
          <p className="muted">Manage your account, password, notification preferences, and ticket reply signature.</p>
        </div>
      </div>

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Profile sections">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                className={activeSection === section.key ? "active" : ""}
                type="button"
                onClick={() => setActiveSection(section.key)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="settings-content">
          {activeSection === "account" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Account Information</h2>
                  <p className="muted">Your email address is managed by an administrator.</p>
                </div>
              </div>
              <div className="grid columns-2">
                <label>
                  First name
                  <input className="input" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </label>
                <label>
                  Last name
                  <input className="input" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </label>
                <label>
                  Email
                  <input className="input" value={profile?.user.email ?? ""} disabled />
                </label>
                <label>
                  Roles
                  <input className="input" value={roles.length ? roles.join(", ") : "No roles assigned"} disabled />
                </label>
              </div>
              <div className="settings-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={busy === "account"}>
                  <Save size={16} aria-hidden="true" />
                  <span>Save Account</span>
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === "password" ? (
            <section className="panel">
              <h2>Password</h2>
              <div className="grid columns-2">
                <label>
                  Current password
                  <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </label>
                <span />
                <label>
                  New password
                  <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </label>
                <label>
                  Confirm new password
                  <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </label>
              </div>
              <p className="muted settings-section">Use at least 12 characters. Changing this password does not expose or store the plain text value.</p>
              <div className="settings-actions">
                <button className="button" type="button" onClick={savePassword} disabled={busy === "password"}>
                  <KeyRound size={16} aria-hidden="true" />
                  <span>Change Password</span>
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === "notifications" && notificationDraft ? (
            <section className="panel">
              <h2>Notifications</h2>
              <div className="grid columns-2">
                <label className="checkbox-row">
                  <input type="checkbox" checked={notificationDraft.inAppEnabled} onChange={(event) => updateNotificationDraft("inAppEnabled", event.target.checked)} />
                  In-app notifications
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={notificationDraft.emailEnabled} onChange={(event) => updateNotificationDraft("emailEnabled", event.target.checked)} />
                  Email notifications
                </label>
              </div>
              <div className="access-check-grid settings-section">
                {NOTIFICATION_FIELDS.map((field) => (
                  <label className="checkbox-row" key={field.key}>
                    <input type="checkbox" checked={Boolean(notificationDraft[field.key])} onChange={(event) => updateNotificationDraft(field.key, event.target.checked)} />
                    {field.label}
                  </label>
                ))}
              </div>
              <label className="checkbox-row settings-section">
                <input type="checkbox" checked={notificationDraft.dailyDigestEnabled} onChange={(event) => updateNotificationDraft("dailyDigestEnabled", event.target.checked)} />
                Daily digest
              </label>
              <div className="settings-actions">
                <button className="button" type="button" onClick={saveNotifications} disabled={busy === "notifications"}>
                  <Save size={16} aria-hidden="true" />
                  <span>Save Notifications</span>
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === "signature" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Ticket Reply Signature</h2>
                  <p className="muted">Safe HTML is allowed. Scripts, unsafe URLs, and unsupported tags are removed when saved.</p>
                </div>
              </div>
              <div className="editor-toolbar" aria-label="Signature tools">
                {SIGNATURE_TOOLBAR.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="icon-button"
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      key={item.label}
                      onClick={() => runSignatureCommand(item.command)}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </button>
                  );
                })}
                <button className="icon-button" type="button" title="Link" aria-label="Link" onClick={addSignatureLink}>
                  <Link size={17} aria-hidden="true" />
                </button>
              </div>
              <div
                ref={signatureEditorRef}
                className="input editor-surface signature-editor signature-render"
                contentEditable
                suppressContentEditableWarning
                onInput={(event) => setSignatureHtml(event.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
              />
              <label className="checkbox-row settings-section">
                <input type="checkbox" checked={useSignatureByDefault} onChange={(event) => setUseSignatureByDefault(event.target.checked)} />
                Use this signature by default for ticket replies
              </label>
              <div className="panel subtle-panel settings-section">
                <h3>
                  <Eye size={16} aria-hidden="true" />
                  Preview
                </h3>
                {signatureHtml.trim() ? <div className="message-body signature-render" dangerouslySetInnerHTML={{ __html: signatureHtml }} /> : <p className="muted">No signature configured.</p>}
              </div>
              <div className="settings-actions">
                <button className="button" type="button" onClick={saveSignature} disabled={busy === "signature"}>
                  <Save size={16} aria-hidden="true" />
                  <span>Save Signature</span>
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
