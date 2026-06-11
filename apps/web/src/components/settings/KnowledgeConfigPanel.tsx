"use client";

import { Link2, Save, TestTube2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface KnowledgeCategory {
  id: string;
  name: string;
}

interface OneNoteSettings {
  knowledgeOneNoteImportEnabled: boolean;
  knowledgeOneNoteTenantId: string | null;
  knowledgeOneNoteClientId: string | null;
  knowledgeOneNoteClientSecretReference: string | null;
  knowledgeOneNoteSourceUserPrincipalName: string | null;
  knowledgeOneNoteDefaultCategoryId: string | null;
  knowledgeOneNoteConnectedUserEmail: string | null;
  knowledgeOneNoteConnectedAt: string | null;
  knowledgeOneNoteConnected: boolean;
}

const defaultSettings: OneNoteSettings = {
  knowledgeOneNoteImportEnabled: false,
  knowledgeOneNoteTenantId: "",
  knowledgeOneNoteClientId: "",
  knowledgeOneNoteClientSecretReference: "env:MICROSOFT_CLIENT_SECRET",
  knowledgeOneNoteSourceUserPrincipalName: "",
  knowledgeOneNoteDefaultCategoryId: "",
  knowledgeOneNoteConnectedUserEmail: null,
  knowledgeOneNoteConnectedAt: null,
  knowledgeOneNoteConnected: false
};

export function KnowledgeConfigPanel() {
  const [settings, setSettings] = useState<OneNoteSettings>(defaultSettings);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
    setError(null);
    try {
      const [settingsData, categoryData] = await Promise.all([
        apiFetch<OneNoteSettings>("/knowledge-base/config/onenote"),
        apiFetch<KnowledgeCategory[]>("/knowledge-base/categories")
      ]);
      setSettings({
        knowledgeOneNoteImportEnabled: settingsData.knowledgeOneNoteImportEnabled,
        knowledgeOneNoteTenantId: settingsData.knowledgeOneNoteTenantId ?? "",
        knowledgeOneNoteClientId: settingsData.knowledgeOneNoteClientId ?? "",
        knowledgeOneNoteClientSecretReference: settingsData.knowledgeOneNoteClientSecretReference ?? "env:MICROSOFT_CLIENT_SECRET",
        knowledgeOneNoteSourceUserPrincipalName: settingsData.knowledgeOneNoteSourceUserPrincipalName ?? "",
        knowledgeOneNoteDefaultCategoryId: settingsData.knowledgeOneNoteDefaultCategoryId ?? "",
        knowledgeOneNoteConnectedUserEmail: settingsData.knowledgeOneNoteConnectedUserEmail ?? null,
        knowledgeOneNoteConnectedAt: settingsData.knowledgeOneNoteConnectedAt ?? null,
        knowledgeOneNoteConnected: settingsData.knowledgeOneNoteConnected
      });
      setCategories(categoryData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Knowledge Base configuration.");
    }
  }

  async function saveSettings() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      await persistSettings();
      setNotice("Knowledge Base OneNote settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Knowledge Base configuration.");
    } finally {
      setBusy(null);
    }
  }

  async function persistSettings() {
    const saved = await apiFetch<OneNoteSettings>("/knowledge-base/config/onenote", {
      method: "PATCH",
      body: JSON.stringify({
        knowledgeOneNoteImportEnabled: settings.knowledgeOneNoteImportEnabled,
        knowledgeOneNoteTenantId: settings.knowledgeOneNoteTenantId || null,
        knowledgeOneNoteClientId: settings.knowledgeOneNoteClientId || null,
        knowledgeOneNoteClientSecretReference: settings.knowledgeOneNoteClientSecretReference || "env:MICROSOFT_CLIENT_SECRET",
        knowledgeOneNoteSourceUserPrincipalName: settings.knowledgeOneNoteSourceUserPrincipalName || null,
        knowledgeOneNoteDefaultCategoryId: settings.knowledgeOneNoteDefaultCategoryId || null
      })
    });
    setSettings({
      knowledgeOneNoteImportEnabled: saved.knowledgeOneNoteImportEnabled,
      knowledgeOneNoteTenantId: saved.knowledgeOneNoteTenantId ?? "",
      knowledgeOneNoteClientId: saved.knowledgeOneNoteClientId ?? "",
      knowledgeOneNoteClientSecretReference: saved.knowledgeOneNoteClientSecretReference ?? "env:MICROSOFT_CLIENT_SECRET",
      knowledgeOneNoteSourceUserPrincipalName: saved.knowledgeOneNoteSourceUserPrincipalName ?? "",
      knowledgeOneNoteDefaultCategoryId: saved.knowledgeOneNoteDefaultCategoryId ?? "",
      knowledgeOneNoteConnectedUserEmail: saved.knowledgeOneNoteConnectedUserEmail ?? null,
      knowledgeOneNoteConnectedAt: saved.knowledgeOneNoteConnectedAt ?? null,
      knowledgeOneNoteConnected: saved.knowledgeOneNoteConnected
    });
    return saved;
  }

  async function connectOneNote() {
    setBusy("connect");
    setError(null);
    setNotice(null);
    try {
      await persistSettings();
      const result = await apiFetch<{ authorizationUrl: string; redirectUri: string }>("/knowledge-base/config/onenote/connect-url", { method: "POST" });
      window.location.href = result.authorizationUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start Microsoft OneNote connection.");
      setBusy(null);
    }
  }

  async function disconnectOneNote() {
    if (!window.confirm("Disconnect Microsoft OneNote import? Existing Knowledge Base articles will not be removed.")) return;
    setBusy("disconnect");
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/knowledge-base/config/onenote/connection", { method: "DELETE" });
      await loadConfig();
      setNotice("Microsoft OneNote disconnected.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to disconnect Microsoft OneNote.");
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ ok: boolean; notebooks: number }>("/knowledge-base/config/onenote/test", { method: "POST" });
      setNotice(result.ok ? `OneNote connection verified. ${result.notebooks} notebook${result.notebooks === 1 ? "" : "s"} found in the first check.` : "OneNote connection check completed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to verify OneNote connection.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel knowledge-config-panel">
      <div className="section-heading">
        <div>
          <h2>Knowledge Config</h2>
          <p className="muted">Configure Microsoft OneNote import for Knowledge Base draft articles.</p>
        </div>
        <span className={`status-pill ${settings.knowledgeOneNoteImportEnabled ? "success" : "muted-pill"}`}>
          {settings.knowledgeOneNoteImportEnabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <div className="nested-panel settings-section">
        <div className="section-heading">
          <div>
            <h3>Microsoft OneNote Import</h3>
            <p className="muted">Connect a Microsoft account with delegated OneNote access to import selected pages as Knowledge Base drafts.</p>
          </div>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.knowledgeOneNoteImportEnabled}
            onChange={(event) => setSettings((current) => ({ ...current, knowledgeOneNoteImportEnabled: event.target.checked }))}
          />
          Enable OneNote import in Knowledge Base
        </label>
        <div className="grid columns-2">
          <label className="field">
            <span>Tenant ID</span>
            <input className="input" value={settings.knowledgeOneNoteTenantId ?? ""} onChange={(event) => setSettings((current) => ({ ...current, knowledgeOneNoteTenantId: event.target.value }))} />
          </label>
          <label className="field">
            <span>Client ID</span>
            <input className="input" value={settings.knowledgeOneNoteClientId ?? ""} onChange={(event) => setSettings((current) => ({ ...current, knowledgeOneNoteClientId: event.target.value }))} />
          </label>
          <label className="field">
            <span>Client secret reference</span>
            <input
              className="input"
              placeholder="env:MICROSOFT_CLIENT_SECRET"
              value={settings.knowledgeOneNoteClientSecretReference ?? ""}
              onChange={(event) => setSettings((current) => ({ ...current, knowledgeOneNoteClientSecretReference: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Login hint email / UPN</span>
            <input
              className="input"
              placeholder="user@domain.com"
              value={settings.knowledgeOneNoteSourceUserPrincipalName ?? ""}
              onChange={(event) => setSettings((current) => ({ ...current, knowledgeOneNoteSourceUserPrincipalName: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Default import category</span>
            <select className="input" value={settings.knowledgeOneNoteDefaultCategoryId ?? ""} onChange={(event) => setSettings((current) => ({ ...current, knowledgeOneNoteDefaultCategoryId: event.target.value }))}>
              <option value="">Imported</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="nested-panel">
          <strong>{settings.knowledgeOneNoteConnected ? "Connected Microsoft account" : "No Microsoft account connected"}</strong>
          <p className="muted">
            {settings.knowledgeOneNoteConnected
              ? `${settings.knowledgeOneNoteConnectedUserEmail ?? "Microsoft account"} connected${settings.knowledgeOneNoteConnectedAt ? ` on ${new Date(settings.knowledgeOneNoteConnectedAt).toLocaleString()}` : ""}.`
              : "Save settings, then connect Microsoft OneNote to authorize delegated access."}
          </p>
        </div>
        <p className="muted">Leave Tenant ID and Client ID blank to use MICROSOFT_TENANT_ID and MICROSOFT_CLIENT_ID from the server environment. Secrets must be saved as env: references. Azure must include the redirect URI /api/knowledge-base/config/onenote/callback.</p>
        <div className="form-actions">
          <button className="button" type="button" onClick={saveSettings} disabled={busy === "save"}>
            <Save size={16} aria-hidden="true" />
            <span>Save OneNote Import</span>
          </button>
          <button className="button secondary" type="button" onClick={connectOneNote} disabled={busy === "connect" || !settings.knowledgeOneNoteImportEnabled}>
            <Link2 size={16} aria-hidden="true" />
            <span>Connect Microsoft OneNote</span>
          </button>
          <button className="button secondary" type="button" onClick={testConnection} disabled={busy === "test" || !settings.knowledgeOneNoteImportEnabled || !settings.knowledgeOneNoteConnected}>
            <TestTube2 size={16} aria-hidden="true" />
            <span>Test Connection</span>
          </button>
          {settings.knowledgeOneNoteConnected ? (
            <button className="button danger" type="button" onClick={disconnectOneNote} disabled={busy === "disconnect"}>
              <Unlink size={16} aria-hidden="true" />
              <span>Disconnect</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
