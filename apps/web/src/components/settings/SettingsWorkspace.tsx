"use client";

import { Plus, RefreshCcw, RotateCw, TestTube2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Mailbox {
  id: string;
  name: string;
  emailAddress: string;
  provider: string;
  connectionMode: string;
  publicEmailAddress: string | null;
  ingestionEmailAddress: string | null;
  outboundMode: string;
  outboundFromAddress: string | null;
  outboundReplyToAddress: string | null;
  preserveOriginalSenderHeaders: boolean;
  tenantId: string | null;
  microsoftClientId: string | null;
  encryptedClientSecretReference: string | null;
  isActive: boolean;
  lastSyncCursor: string | null;
  autoSyncEnabled: boolean;
  autoSyncIntervalSeconds: number | null;
  nextAutoSyncAt: string | null;
  initialSyncFrom: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

interface SyncResult {
  receivedMessages: number;
  createdTickets: number;
  skippedDuplicates: number;
  attachmentBackfillFailures?: number;
  nextSyncCursor?: string | null;
}

interface RoutingApplyResult {
  scanned: number;
  matched: number;
}

interface Client {
  id: string;
  name: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TicketTeam {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  members: Array<{ user: User }>;
  _count?: { assignedTickets: number };
}

interface RoutingRule {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  subjectContains: string | null;
  bodyContains: string | null;
  senderDomain: string | null;
  assignTeam?: { id: string; name: string } | null;
  assignUser?: User | null;
}

interface UnmappedDomain {
  id: string;
  domain: string;
  firstSenderEmail: string | null;
  lastSenderEmail: string | null;
  messageCount: number;
  lastSeenAt: string;
}

interface AiProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string | null;
  apiKeyReference: string | null;
  defaultModel: string | null;
  isEnabled: boolean;
  timeoutMs: number;
  priority: number;
  models: AiModelConfig[];
}

interface AiModelConfig {
  id: string;
  name: string;
  displayName: string | null;
  isDefault: boolean;
  isEnabled: boolean;
}

interface AiActionSetting {
  id: string;
  actionType: string;
  providerConfigId: string | null;
  modelConfigId: string | null;
  isEnabled: boolean;
  temperature: number | null;
  maxOutputTokens: number | null;
  systemPrompt: string | null;
}

interface AiProviderTestResult {
  ok: boolean;
  providerId: string;
  provider: string;
  model: string;
  latencyMs: number;
  responsePreview: string;
}

const AI_ACTIONS = [
  { type: "paraphrase", label: "Paraphrase" },
  { type: "improve_reply", label: "Improve reply" },
  { type: "suggest_reply", label: "Draft reply" },
  { type: "fix_grammar", label: "Fix grammar" },
  { type: "summarize", label: "Summarize ticket" },
  { type: "translate", label: "Translate" },
  { type: "change_tone", label: "Change tone" }
];

const AI_PROVIDER_LABELS: Record<string, string> = {
  OPENAI_COMPATIBLE: "OpenAI compatible",
  ANTHROPIC: "Anthropic Claude",
  GEMINI: "Google Gemini",
  AZURE_OPENAI: "Azure OpenAI",
  OLLAMA: "Ollama / local",
  CUSTOM_HTTP: "Custom HTTP",
  MOCK: "Mock"
};

function normalizeSyncIntervalSeconds(value: string, unit: "seconds" | "minutes") {
  const parsed = Number(value);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed * (unit === "minutes" ? 60 : 1)) : 300;
  return Math.min(86400, Math.max(30, seconds));
}

export function SettingsWorkspace() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ticketTeams, setTicketTeams] = useState<TicketTeam[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [unmappedDomains, setUnmappedDomains] = useState<UnmappedDomain[]>([]);
  const [aiProviders, setAiProviders] = useState<AiProviderConfig[]>([]);
  const [aiActionSettings, setAiActionSettings] = useState<AiActionSetting[]>([]);
  const [mailboxDrafts, setMailboxDrafts] = useState<
    Record<
      string,
      {
        provider: string;
        emailAddress: string;
        connectionMode: string;
        publicEmailAddress: string;
        ingestionEmailAddress: string;
        outboundMode: string;
        outboundFromAddress: string;
        outboundReplyToAddress: string;
        preserveOriginalSenderHeaders: boolean;
        autoSyncEnabled: boolean;
        autoSyncIntervalSeconds: string;
        autoSyncUnit: "seconds" | "minutes";
        initialSyncFrom: string;
        tenantId: string;
        microsoftClientId: string;
        encryptedClientSecretReference: string;
      }
    >
  >({});
  const [ruleDraft, setRuleDraft] = useState({
    name: "",
    subjectContains: "",
    bodyContains: "",
    senderDomain: "",
    assignUserId: "",
    assignTeamId: "",
    setPriority: ""
  });
  const [teamDraft, setTeamDraft] = useState({ name: "", description: "", memberIds: [] as string[] });
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamEditDraft, setTeamEditDraft] = useState({ name: "", description: "", memberIds: [] as string[], isActive: true });
  const [aiProviderDraft, setAiProviderDraft] = useState({
    name: "",
    provider: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.openai.com/v1",
    apiKeyReference: "env:OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    timeoutMs: "30000",
    priority: "100",
    isEnabled: true
  });
  const [aiModelDrafts, setAiModelDrafts] = useState<Record<string, string>>({});
  const [aiActionDrafts, setAiActionDrafts] = useState<Record<string, { providerConfigId: string; modelConfigId: string; isEnabled: boolean }>>({});
  const [selectedAiActions, setSelectedAiActions] = useState<string[]>([]);
  const [aiBulkDraft, setAiBulkDraft] = useState({ providerConfigId: "", modelConfigId: "", isEnabled: true });
  const [showAiProviderForm, setShowAiProviderForm] = useState(false);
  const [aiTestResults, setAiTestResults] = useState<Record<string, { status: "success" | "error" | "testing"; message: string }>>({});
  const [selectedClientByDomain, setSelectedClientByDomain] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"mailboxes" | "teams" | "routing" | "domains" | "ai">("mailboxes");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigError, setAiConfigError] = useState<string | null>(null);

  const hasClients = useMemo(() => clients.length > 0, [clients.length]);
  const bulkProvider = useMemo(() => aiProviders.find((provider) => provider.id === aiBulkDraft.providerConfigId), [aiBulkDraft.providerConfigId, aiProviders]);

  function aiProviderDefaults(provider: string) {
    switch (provider) {
      case "GEMINI":
        return { baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKeyReference: "env:GEMINI_API_KEY", defaultModel: "gemini-2.0-flash" };
      case "ANTHROPIC":
        return { baseUrl: "https://api.anthropic.com/v1", apiKeyReference: "env:ANTHROPIC_API_KEY", defaultModel: "claude-3-5-sonnet-latest" };
      case "OLLAMA":
        return { baseUrl: "http://localhost:11434", apiKeyReference: "", defaultModel: "llama3.1" };
      case "MOCK":
        return { baseUrl: "", apiKeyReference: "", defaultModel: "mock" };
      default:
        return { baseUrl: "https://api.openai.com/v1", apiKeyReference: "env:OPENAI_API_KEY", defaultModel: "gpt-4o-mini" };
    }
  }

  async function loadSettingsData() {
    setLoading(true);
    setError(null);
    try {
      const [mailboxData, clientData, unmappedData, userData, teamData, ruleData] = await Promise.all([
        apiFetch<Mailbox[]>("/mailboxes"),
        apiFetch<Client[]>("/clients"),
        apiFetch<UnmappedDomain[]>("/client-domains/unmapped"),
        apiFetch<User[]>("/users"),
        apiFetch<TicketTeam[]>("/ticket-teams"),
        apiFetch<RoutingRule[]>("/ticket-routing-rules")
      ]);
      setMailboxes(mailboxData);
      setClients(clientData);
      setUnmappedDomains(unmappedData);
      setUsers(userData);
      setTicketTeams(teamData);
      setRoutingRules(ruleData);
      setMailboxDrafts(
        Object.fromEntries(
          mailboxData.map((mailbox) => [
            mailbox.id,
            {
              provider: mailbox.provider,
              emailAddress: mailbox.emailAddress,
              connectionMode: mailbox.connectionMode,
              publicEmailAddress: mailbox.publicEmailAddress ?? mailbox.emailAddress,
              ingestionEmailAddress: mailbox.ingestionEmailAddress ?? "",
              outboundMode: mailbox.outboundMode,
              outboundFromAddress: mailbox.outboundFromAddress ?? mailbox.publicEmailAddress ?? mailbox.emailAddress,
              outboundReplyToAddress: mailbox.outboundReplyToAddress ?? mailbox.publicEmailAddress ?? mailbox.emailAddress,
              preserveOriginalSenderHeaders: mailbox.preserveOriginalSenderHeaders,
              autoSyncEnabled: mailbox.autoSyncEnabled,
              autoSyncIntervalSeconds: mailbox.autoSyncIntervalSeconds
                ? mailbox.autoSyncIntervalSeconds >= 60 && mailbox.autoSyncIntervalSeconds % 60 === 0
                  ? String(mailbox.autoSyncIntervalSeconds / 60)
                  : String(mailbox.autoSyncIntervalSeconds)
                : "5",
              autoSyncUnit: mailbox.autoSyncIntervalSeconds && mailbox.autoSyncIntervalSeconds >= 60 && mailbox.autoSyncIntervalSeconds % 60 === 0 ? "minutes" : "seconds",
              initialSyncFrom: mailbox.initialSyncFrom ? mailbox.initialSyncFrom.slice(0, 10) : "",
              tenantId: mailbox.tenantId ?? "",
              microsoftClientId: mailbox.microsoftClientId ?? "",
              encryptedClientSecretReference: mailbox.encryptedClientSecretReference ?? "env:MICROSOFT_CLIENT_SECRET"
            }
          ])
        )
      );

      try {
        const [aiProviderData, aiActionData] = await Promise.all([
          apiFetch<AiProviderConfig[]>("/ai/providers"),
          apiFetch<AiActionSetting[]>("/ai/action-settings")
        ]);
        setAiConfigError(null);
        setAiProviders(aiProviderData);
        setAiActionSettings(aiActionData);
        setAiActionDrafts(
          Object.fromEntries(
            aiActionData.map((setting) => [
              setting.actionType,
              {
                providerConfigId: setting.providerConfigId ?? "",
                modelConfigId: setting.modelConfigId ?? "",
                isEnabled: setting.isEnabled
              }
            ])
          )
        );
      } catch {
        setAiConfigError("AI provider tables are not available yet. Apply the AI provider registry migration before configuring AI providers.");
        setAiProviders([]);
        setAiActionSettings([]);
        setAiActionDrafts({});
      }
    } catch {
      setError("Unable to load settings data.");
    } finally {
      setLoading(false);
    }
  }

  async function saveMailbox(mailbox: Mailbox) {
    const draft = mailboxDrafts[mailbox.id];
    if (!draft) {
      return;
    }

    setBusy(mailbox.id);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/mailboxes/${mailbox.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          provider: draft.provider,
          emailAddress: draft.emailAddress,
          connectionMode: draft.connectionMode,
          publicEmailAddress: draft.publicEmailAddress || null,
          ingestionEmailAddress: draft.ingestionEmailAddress || null,
          outboundMode: draft.outboundMode,
          outboundFromAddress: draft.outboundFromAddress || null,
          outboundReplyToAddress: draft.outboundReplyToAddress || null,
          preserveOriginalSenderHeaders: draft.preserveOriginalSenderHeaders,
          autoSyncEnabled: draft.autoSyncEnabled,
          autoSyncIntervalSeconds: draft.autoSyncEnabled ? normalizeSyncIntervalSeconds(draft.autoSyncIntervalSeconds, draft.autoSyncUnit) : null,
          initialSyncFrom: draft.initialSyncFrom || null,
          tenantId: draft.tenantId || null,
          microsoftClientId: draft.microsoftClientId || null,
          encryptedClientSecretReference: draft.encryptedClientSecretReference || null
        })
      });
      setNotice("Mailbox settings saved.");
      await loadSettingsData();
    } catch {
      setError("Unable to save mailbox settings.");
    } finally {
      setBusy(null);
    }
  }

  async function createRoutingRule() {
    if (!ruleDraft.name.trim()) {
      setError("Routing rule name is required.");
      return;
    }

    setBusy("routing-rule");
    setNotice(null);
    setError(null);
    try {
      await apiFetch("/ticket-routing-rules", {
        method: "POST",
        body: JSON.stringify({
          name: ruleDraft.name,
          subjectContains: ruleDraft.subjectContains || undefined,
          bodyContains: ruleDraft.bodyContains || undefined,
          senderDomain: ruleDraft.senderDomain || undefined,
          assignUserId: ruleDraft.assignUserId || undefined,
          assignTeamId: ruleDraft.assignTeamId || undefined,
          setPriority: ruleDraft.setPriority || undefined
        })
      });
      setRuleDraft({ name: "", subjectContains: "", bodyContains: "", senderDomain: "", assignUserId: "", assignTeamId: "", setPriority: "" });
      setNotice("Routing rule created.");
      await loadSettingsData();
    } catch {
      setError("Unable to create routing rule.");
    } finally {
      setBusy(null);
    }
  }

  async function applyRoutingRulesToExistingTickets() {
    if (!window.confirm("Apply active routing rules to existing active tickets? This can update ticket technician, team, priority, and watchers when rules match.")) {
      return;
    }

    setBusy("routing-apply-existing");
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<RoutingApplyResult>("/ticket-routing-rules/apply-existing", { method: "POST" });
      setNotice(`Routing rules applied: ${result.matched} matched out of ${result.scanned} scanned tickets.`);
      await loadSettingsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply routing rules.");
    } finally {
      setBusy(null);
    }
  }

  async function createTicketTeam() {
    if (!teamDraft.name.trim()) {
      setError("Ticket team name is required.");
      return;
    }

    setBusy("ticket-team");
    setNotice(null);
    setError(null);
    try {
      await apiFetch("/ticket-teams", {
        method: "POST",
        body: JSON.stringify({
          name: teamDraft.name,
          description: teamDraft.description || null,
          memberIds: teamDraft.memberIds
        })
      });
      setTeamDraft({ name: "", description: "", memberIds: [] });
      setNotice("Ticket team created.");
      await loadSettingsData();
    } catch {
      setError("Unable to create ticket team.");
    } finally {
      setBusy(null);
    }
  }

  async function updateTicketTeam() {
    if (!editingTeamId || !teamEditDraft.name.trim()) {
      setError("Ticket team name is required.");
      return;
    }

    setBusy(editingTeamId);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/ticket-teams/${editingTeamId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: teamEditDraft.name,
          description: teamEditDraft.description || null,
          memberIds: teamEditDraft.memberIds,
          isActive: teamEditDraft.isActive
        })
      });
      setEditingTeamId(null);
      setNotice("Ticket team updated.");
      await loadSettingsData();
    } catch {
      setError("Unable to update ticket team.");
    } finally {
      setBusy(null);
    }
  }

  async function deactivateTicketTeam(teamId: string) {
    if (!window.confirm("Deactivate this ticket team? Existing ticket history will be preserved.")) {
      return;
    }

    setBusy(teamId);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/ticket-teams/${teamId}`, { method: "DELETE" });
      setNotice("Ticket team deactivated.");
      await loadSettingsData();
    } catch {
      setError("Unable to deactivate ticket team.");
    } finally {
      setBusy(null);
    }
  }

  function toggleTeamDraftMember(userId: string) {
    setTeamDraft((current) => ({
      ...current,
      memberIds: current.memberIds.includes(userId) ? current.memberIds.filter((id) => id !== userId) : [...current.memberIds, userId]
    }));
  }

  function startEditingTeam(team: TicketTeam) {
    setEditingTeamId(team.id);
    setTeamEditDraft({
      name: team.name,
      description: team.description ?? "",
      memberIds: team.members.map((member) => member.user.id),
      isActive: team.isActive
    });
  }

  function toggleTeamEditMember(userId: string) {
    setTeamEditDraft((current) => ({
      ...current,
      memberIds: current.memberIds.includes(userId) ? current.memberIds.filter((id) => id !== userId) : [...current.memberIds, userId]
    }));
  }

  async function syncMailbox(mailbox: Mailbox) {
    setBusy(mailbox.id);
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<SyncResult>(`/mailboxes/${mailbox.id}/sync`, { method: "POST" });
      setNotice(
        `Mailbox sync completed: ${result.receivedMessages} received, ${result.createdTickets} tickets created, ${result.skippedDuplicates} duplicates skipped${
          result.attachmentBackfillFailures ? `, ${result.attachmentBackfillFailures} attachment backfill failures` : ""
        }.`
      );
      await loadSettingsData();
    } catch {
      setError("Unable to sync mailbox.");
    } finally {
      setBusy(null);
    }
  }

  async function associateDomain(unmapped: UnmappedDomain) {
    const clientId = selectedClientByDomain[unmapped.id];
    if (!clientId) {
      setError("Select a client before associating the domain.");
      return;
    }

    setBusy(unmapped.id);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/client-domains/unmapped/${unmapped.id}/associate`, {
        method: "POST",
        body: JSON.stringify({ clientId })
      });
      setNotice(`${unmapped.domain} was associated and matching tickets were updated.`);
      await loadSettingsData();
    } catch {
      setError("Unable to associate domain.");
    } finally {
      setBusy(null);
    }
  }

  async function createAiProvider() {
    if (!aiProviderDraft.name.trim()) {
      setError("AI provider name is required.");
      return;
    }

    setBusy("ai-provider");
    setNotice(null);
    setError(null);
    try {
      await apiFetch("/ai/providers", {
        method: "POST",
        body: JSON.stringify({
          name: aiProviderDraft.name,
          provider: aiProviderDraft.provider,
          baseUrl: aiProviderDraft.baseUrl || null,
          apiKeyReference: aiProviderDraft.apiKeyReference || null,
          defaultModel: aiProviderDraft.defaultModel || null,
          timeoutMs: Number(aiProviderDraft.timeoutMs),
          priority: Number(aiProviderDraft.priority),
          isEnabled: aiProviderDraft.isEnabled
        })
      });
      setAiProviderDraft({
        name: "",
        provider: "OPENAI_COMPATIBLE",
        baseUrl: "https://api.openai.com/v1",
        apiKeyReference: "env:OPENAI_API_KEY",
        defaultModel: "gpt-4o-mini",
        timeoutMs: "30000",
        priority: "100",
        isEnabled: true
      });
      setShowAiProviderForm(false);
      setNotice("AI provider saved.");
      await loadSettingsData();
    } catch {
      setError("Unable to save AI provider. Confirm the AI provider registry migration has been applied.");
    } finally {
      setBusy(null);
    }
  }

  async function addAiModel(providerId: string) {
    const modelName = aiModelDrafts[providerId]?.trim();
    if (!modelName) {
      setError("Model name is required.");
      return;
    }

    setBusy(`ai-model-${providerId}`);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/ai/providers/${providerId}/models`, {
        method: "POST",
        body: JSON.stringify({
          name: modelName,
          displayName: modelName,
          isDefault: true,
          isEnabled: true
        })
      });
      setAiModelDrafts((current) => ({ ...current, [providerId]: "" }));
      setNotice("AI model saved.");
      await loadSettingsData();
    } catch {
      setError("Unable to save AI model. Confirm the AI provider registry migration has been applied.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAiAction(actionType: string) {
    const draft = aiActionDrafts[actionType];
    if (!draft) {
      return;
    }

    setBusy(`ai-action-${actionType}`);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/ai/action-settings/${actionType}`, {
        method: "PATCH",
        body: JSON.stringify({
          providerConfigId: draft.providerConfigId || null,
          modelConfigId: draft.modelConfigId || null,
          isEnabled: draft.isEnabled
        })
      });
      setNotice("AI action setting saved.");
      await loadSettingsData();
    } catch {
      setError("Unable to save AI action setting. Confirm the AI provider registry migration has been applied.");
    } finally {
      setBusy(null);
    }
  }

  async function testAiProvider(providerId: string) {
    setBusy(`ai-test-${providerId}`);
    setNotice(null);
    setError(null);
    setAiTestResults((current) => ({
      ...current,
      [providerId]: { status: "testing", message: "Testing provider connection..." }
    }));
    try {
      const result = await apiFetch<AiProviderTestResult>(`/ai/providers/${providerId}/test`, { method: "POST" });
      setAiTestResults((current) => ({
        ...current,
        [providerId]: {
          status: "success",
          message: `Connected with ${result.model} in ${result.latencyMs} ms. ${result.responsePreview}`
        }
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown provider connection error.";
      setAiTestResults((current) => ({
        ...current,
        [providerId]: { status: "error", message: message.slice(0, 500) }
      }));
    } finally {
      setBusy(null);
    }
  }

  function toggleAiAction(actionType: string, checked: boolean) {
    setSelectedAiActions((current) => (checked ? [...new Set([...current, actionType])] : current.filter((selected) => selected !== actionType)));
  }

  function applyBulkAiActionDraft() {
    if (selectedAiActions.length === 0) {
      setError("Select at least one AI action before applying bulk settings.");
      return;
    }

    setAiActionDrafts((current) => {
      const next = { ...current };
      for (const actionType of selectedAiActions) {
        next[actionType] = {
          providerConfigId: aiBulkDraft.providerConfigId,
          modelConfigId: aiBulkDraft.modelConfigId,
          isEnabled: aiBulkDraft.isEnabled
        };
      }
      return next;
    });
    setNotice(`Bulk settings applied to ${selectedAiActions.length} AI action${selectedAiActions.length === 1 ? "" : "s"}. Save bulk changes to persist them.`);
  }

  async function saveBulkAiActions() {
    if (selectedAiActions.length === 0) {
      setError("Select at least one AI action before saving bulk settings.");
      return;
    }

    setBusy("ai-action-bulk");
    setNotice(null);
    setError(null);
    try {
      await Promise.all(
        selectedAiActions.map((actionType) => {
          const draft = aiActionDrafts[actionType] ?? aiBulkDraft;
          return apiFetch(`/ai/action-settings/${actionType}`, {
            method: "PATCH",
            body: JSON.stringify({
              providerConfigId: draft.providerConfigId || null,
              modelConfigId: draft.modelConfigId || null,
              isEnabled: draft.isEnabled
            })
          });
        })
      );
      setNotice(`Bulk AI action settings saved for ${selectedAiActions.length} action${selectedAiActions.length === 1 ? "" : "s"}.`);
      await loadSettingsData();
    } catch {
      setError("Unable to save bulk AI action settings. Confirm the AI provider registry migration has been applied.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadSettingsData();
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Mailbox sync, unknown sender domains, branding, attachment policy, AI, and remote access settings.</p>
        </div>
        <button className="button secondary" type="button" onClick={loadSettingsData} disabled={loading}>
          <RefreshCcw size={16} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button className={activeSection === "mailboxes" ? "active" : ""} type="button" onClick={() => setActiveSection("mailboxes")}>
            Mailboxes
          </button>
          <button className={activeSection === "teams" ? "active" : ""} type="button" onClick={() => setActiveSection("teams")}>
            Ticket Teams
          </button>
          <button className={activeSection === "routing" ? "active" : ""} type="button" onClick={() => setActiveSection("routing")}>
            Ticket Routing
          </button>
          <button className={activeSection === "domains" ? "active" : ""} type="button" onClick={() => setActiveSection("domains")}>
            Domain Mapping
          </button>
          <button className={activeSection === "ai" ? "active" : ""} type="button" onClick={() => setActiveSection("ai")}>
            AI & Security
          </button>
        </nav>

        <div className="settings-content">
          {activeSection === "mailboxes" ? (
      <section className="grid columns-2">
        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>Mailboxes</h2>
              <p className="muted">Run inbound sync for configured support mailboxes.</p>
            </div>
          </div>
          <div className="stack-list">
            {loading ? <p className="muted">Loading mailboxes...</p> : null}
            {!loading && mailboxes.length === 0 ? <p className="muted">No mailboxes configured.</p> : null}
            {mailboxes.map((mailbox) => (
              <div className="stack-row mailbox-config-row" key={mailbox.id}>
                <div>
                  <strong>{mailbox.name}</strong>
                  <span className="muted">
                    {mailbox.emailAddress} - {mailbox.connectionMode} - {mailbox.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="muted">
                    Last sync: {mailbox.lastSyncedAt ? new Date(mailbox.lastSyncedAt).toLocaleString() : "Never"}
                    {mailbox.autoSyncEnabled ? ` - Auto sync every ${mailbox.autoSyncIntervalSeconds ?? 300}s` : " - Auto sync off"}
                  </span>
                  {mailbox.lastSyncError ? <span className="error">{mailbox.lastSyncError}</span> : null}
                  <div className="client-form-grid mailbox-form-grid">
                    <select
                      className="input compact-select"
                      value={mailboxDrafts[mailbox.id]?.provider ?? mailbox.provider}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], provider: event.target.value }
                        }))
                      }
                    >
                      <option value="MOCK">Mock</option>
                      <option value="MICROSOFT365">Microsoft 365</option>
                    </select>
                    <select
                      className="input compact-select"
                      value={mailboxDrafts[mailbox.id]?.connectionMode ?? mailbox.connectionMode}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], connectionMode: event.target.value }
                        }))
                      }
                    >
                      <option value="GRAPH_DIRECT">Graph direct mailbox</option>
                      <option value="GRAPH_FORWARDED_MAILBOX">Graph forwarded mailbox</option>
                      <option value="MOCK">Mock local mailbox</option>
                    </select>
                    <input
                      className="input"
                      type="email"
                      placeholder="Mailbox to read"
                      value={mailboxDrafts[mailbox.id]?.emailAddress ?? mailbox.emailAddress}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], emailAddress: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="input"
                      type="email"
                      placeholder="Public support address"
                      value={mailboxDrafts[mailbox.id]?.publicEmailAddress ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], publicEmailAddress: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="input"
                      type="email"
                      placeholder="Forwarded ingestion mailbox"
                      value={mailboxDrafts[mailbox.id]?.ingestionEmailAddress ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], ingestionEmailAddress: event.target.value }
                        }))
                      }
                    />
                    <select
                      className="input compact-select"
                      value={mailboxDrafts[mailbox.id]?.outboundMode ?? mailbox.outboundMode}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], outboundMode: event.target.value }
                        }))
                      }
                    >
                      <option value="GRAPH_SEND_AS">Send as public address</option>
                      <option value="GRAPH_SEND_ON_BEHALF">Send on behalf</option>
                      <option value="SMTP_RELAY">SMTP relay later</option>
                      <option value="NONE">Inbound only</option>
                    </select>
                    <input
                      className="input"
                      type="email"
                      placeholder="Outbound from address"
                      value={mailboxDrafts[mailbox.id]?.outboundFromAddress ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], outboundFromAddress: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="input"
                      type="email"
                      placeholder="Reply-To address"
                      value={mailboxDrafts[mailbox.id]?.outboundReplyToAddress ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], outboundReplyToAddress: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="input compact-select"
                      type="date"
                      value={mailboxDrafts[mailbox.id]?.initialSyncFrom ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], initialSyncFrom: event.target.value }
                        }))
                      }
                    />
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={mailboxDrafts[mailbox.id]?.preserveOriginalSenderHeaders ?? true}
                        onChange={(event) =>
                          setMailboxDrafts((current) => ({
                            ...current,
                            [mailbox.id]: { ...current[mailbox.id], preserveOriginalSenderHeaders: event.target.checked }
                          }))
                        }
                      />
                      <span>Preserve original sender from forwarded headers</span>
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={mailboxDrafts[mailbox.id]?.autoSyncEnabled ?? false}
                        onChange={(event) =>
                          setMailboxDrafts((current) => ({
                            ...current,
                            [mailbox.id]: { ...current[mailbox.id], autoSyncEnabled: event.target.checked }
                          }))
                        }
                      />
                      <span>Run automatic inbound sync</span>
                    </label>
                    <input
                      className="input compact-select"
                      type="number"
                      min={mailboxDrafts[mailbox.id]?.autoSyncUnit === "minutes" ? 1 : 30}
                      max={mailboxDrafts[mailbox.id]?.autoSyncUnit === "minutes" ? 1440 : 86400}
                      placeholder="Sync interval"
                      value={mailboxDrafts[mailbox.id]?.autoSyncIntervalSeconds ?? "5"}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], autoSyncIntervalSeconds: event.target.value }
                        }))
                      }
                    />
                    <select
                      className="input compact-select"
                      value={mailboxDrafts[mailbox.id]?.autoSyncUnit ?? "minutes"}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], autoSyncUnit: event.target.value as "seconds" | "minutes" }
                        }))
                      }
                    >
                      <option value="seconds">Seconds</option>
                      <option value="minutes">Minutes</option>
                    </select>
                    <input
                      className="input"
                      placeholder="Tenant ID"
                      value={mailboxDrafts[mailbox.id]?.tenantId ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], tenantId: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="input"
                      placeholder="Client ID"
                      value={mailboxDrafts[mailbox.id]?.microsoftClientId ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], microsoftClientId: event.target.value }
                        }))
                      }
                    />
                    <input
                      className="input"
                      placeholder="Secret reference"
                      value={mailboxDrafts[mailbox.id]?.encryptedClientSecretReference ?? ""}
                      onChange={(event) =>
                        setMailboxDrafts((current) => ({
                          ...current,
                          [mailbox.id]: { ...current[mailbox.id], encryptedClientSecretReference: event.target.value }
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="button secondary" type="button" onClick={() => saveMailbox(mailbox)} disabled={busy === mailbox.id}>
                    Save
                  </button>
                  <button className="button" type="button" onClick={() => syncMailbox(mailbox)} disabled={busy === mailbox.id}>
                    <RotateCw size={16} aria-hidden="true" />
                    <span>Sync</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Security Defaults</h2>
          <p className="muted">HttpOnly sessions, attachment restrictions, and audit logging are active design constraints.</p>
        </div>
      </section>
          ) : null}

          {activeSection === "teams" ? (
      <section className="panel settings-section">
        <div className="section-heading">
          <div>
            <h2>Ticket Teams</h2>
            <p className="muted">Operational teams used for ticket routing, assignment, and team notifications. These are separate from access groups and roles.</p>
          </div>
          <span className="status-pill">{ticketTeams.filter((team) => team.isActive).length} active</span>
        </div>
        <div className="access-form">
          <div className="client-form-grid">
            <input className="input" placeholder="Team name" value={teamDraft.name} onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))} />
            <input
              className="input"
              placeholder="Description"
              value={teamDraft.description}
              onChange={(event) => setTeamDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
          <div>
            <strong>Members</strong>
            <div className="access-check-grid settings-section">
              {users.map((user) => (
                <label className="checkbox-row" key={user.id}>
                  <input type="checkbox" checked={teamDraft.memberIds.includes(user.id)} onChange={() => toggleTeamDraftMember(user.id)} />
                  {user.firstName} {user.lastName}
                </label>
              ))}
            </div>
          </div>
          <button className="button" type="button" onClick={createTicketTeam} disabled={busy === "ticket-team"}>
            Create Team
          </button>
        </div>
        <div className="table-scroll settings-section">
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Members</th>
                <th>Status</th>
                <th>Assigned Tickets</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ticketTeams.length === 0 ? (
                <tr>
                  <td colSpan={5}>No ticket teams configured.</td>
                </tr>
              ) : null}
              {ticketTeams.map((team) => (
                editingTeamId === team.id ? (
                  <tr key={team.id}>
                    <td colSpan={5}>
                      <div className="access-form">
                        <div className="client-form-grid">
                          <input className="input" value={teamEditDraft.name} onChange={(event) => setTeamEditDraft((current) => ({ ...current, name: event.target.value }))} />
                          <input className="input" value={teamEditDraft.description} onChange={(event) => setTeamEditDraft((current) => ({ ...current, description: event.target.value }))} />
                        </div>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={teamEditDraft.isActive} onChange={(event) => setTeamEditDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                          Active
                        </label>
                        <div className="access-check-grid">
                          {users.map((user) => (
                            <label className="checkbox-row" key={user.id}>
                              <input type="checkbox" checked={teamEditDraft.memberIds.includes(user.id)} onChange={() => toggleTeamEditMember(user.id)} />
                              {user.firstName} {user.lastName}
                            </label>
                          ))}
                        </div>
                        <div className="form-actions">
                          <button className="button" type="button" onClick={updateTicketTeam} disabled={busy === team.id}>
                            Save Team
                          </button>
                          <button className="button secondary" type="button" onClick={() => setEditingTeamId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={team.id}>
                    <td>
                      <strong>{team.name}</strong>
                      <span className="muted">{team.description ?? "No description"}</span>
                    </td>
                    <td>{team.members.length ? team.members.map((member) => `${member.user.firstName} ${member.user.lastName}`).join(", ") : "No members"}</td>
                    <td>
                      <span className="status-pill">{team.isActive ? "Active" : "Inactive"}</span>
                    </td>
                    <td>{team._count?.assignedTickets ?? 0}</td>
                    <td>
                      <div className="form-actions">
                        <button className="button secondary" type="button" onClick={() => startEditingTeam(team)}>
                          Edit
                        </button>
                        <button className="button secondary" type="button" onClick={() => deactivateTicketTeam(team.id)} disabled={!team.isActive || busy === team.id}>
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </section>
          ) : null}

          {activeSection === "routing" ? (
      <section className="panel settings-section">
        <div className="section-heading">
          <div>
            <h2>Ticket Routing Rules</h2>
            <p className="muted">Match inbound tickets by sender, subject, or body, then assign and notify staff.</p>
          </div>
          <button className="button secondary" type="button" onClick={applyRoutingRulesToExistingTickets} disabled={busy === "routing-apply-existing"}>
            Apply to Existing Tickets
          </button>
        </div>
        <div className="client-form-grid">
          <input className="input" placeholder="Rule name" value={ruleDraft.name} onChange={(event) => setRuleDraft((current) => ({ ...current, name: event.target.value }))} />
          <input
            className="input"
            placeholder="Subject contains"
            value={ruleDraft.subjectContains}
            onChange={(event) => setRuleDraft((current) => ({ ...current, subjectContains: event.target.value }))}
          />
          <input
            className="input"
            placeholder="Body contains"
            value={ruleDraft.bodyContains}
            onChange={(event) => setRuleDraft((current) => ({ ...current, bodyContains: event.target.value }))}
          />
          <input
            className="input"
            placeholder="Sender domain"
            value={ruleDraft.senderDomain}
            onChange={(event) => setRuleDraft((current) => ({ ...current, senderDomain: event.target.value }))}
          />
          <select className="input" value={ruleDraft.assignUserId} onChange={(event) => setRuleDraft((current) => ({ ...current, assignUserId: event.target.value }))}>
            <option value="">Assign technician</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
          <select className="input" value={ruleDraft.assignTeamId} onChange={(event) => setRuleDraft((current) => ({ ...current, assignTeamId: event.target.value }))}>
            <option value="">Assign ticket team</option>
            {ticketTeams.filter((team) => team.isActive).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <select className="input" value={ruleDraft.setPriority} onChange={(event) => setRuleDraft((current) => ({ ...current, setPriority: event.target.value }))}>
            <option value="">Keep priority</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <button className="button" type="button" onClick={createRoutingRule} disabled={busy === "routing-rule"}>
            Create Rule
          </button>
        </div>
        <div className="stack-list settings-section">
          {routingRules.length === 0 ? <p className="muted">No routing rules yet.</p> : null}
          {routingRules.map((rule) => (
            <div className="stack-row compact" key={rule.id}>
              <div>
                <strong>{rule.name}</strong>
                <span className="muted">
                  {rule.isActive ? "Active" : "Inactive"} - Priority {rule.priority}
                </span>
              </div>
              <span className="muted">
                {[rule.subjectContains && `Subject: ${rule.subjectContains}`, rule.bodyContains && `Body: ${rule.bodyContains}`, rule.senderDomain && `Domain: ${rule.senderDomain}`]
                  .filter(Boolean)
                  .join(" | ") || "No conditions"}
              </span>
              <span className="muted">
                Assigned to {rule.assignUser ? `${rule.assignUser.firstName} ${rule.assignUser.lastName}` : "no technician"}
                {rule.assignTeam ? ` / ${rule.assignTeam.name}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
          ) : null}

          {activeSection === "domains" ? (
      <section className="panel settings-section">
        <div className="section-heading">
          <div>
            <h2>Unmapped Email Domains</h2>
            <p className="muted">Associate unknown sender domains to clients. Matching tickets and requesters will be updated.</p>
          </div>
          <span className="status-pill">{unmappedDomains.length} open</span>
        </div>
        <div className="stack-list">
          {loading ? <p className="muted">Loading domains...</p> : null}
          {!loading && unmappedDomains.length === 0 ? <p className="muted">No unmapped domains waiting for review.</p> : null}
          {unmappedDomains.map((unmapped) => (
            <div className="stack-row domain-review-row" key={unmapped.id}>
              <div>
                <strong>{unmapped.domain}</strong>
                <span className="muted">
                  {unmapped.messageCount} message{unmapped.messageCount === 1 ? "" : "s"} - Last sender: {unmapped.lastSenderEmail ?? "Unknown"}
                </span>
              </div>
              <div className="form-actions">
                <select
                  className="input compact-select"
                  value={selectedClientByDomain[unmapped.id] ?? ""}
                  onChange={(event) => setSelectedClientByDomain((current) => ({ ...current, [unmapped.id]: event.target.value }))}
                  disabled={!hasClients}
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <button className="button" type="button" onClick={() => associateDomain(unmapped)} disabled={busy === unmapped.id || !hasClients}>
                  Associate
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
          ) : null}

          {activeSection === "ai" ? (
            <section className="grid">
              {aiConfigError ? <div className="error-banner">{aiConfigError}</div> : null}
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>AI Providers</h2>
                    <p className="muted">Register providers, test their API connection, and then assign them to ticket writing actions.</p>
                  </div>
                  <button className="button" type="button" onClick={() => setShowAiProviderForm(true)} disabled={Boolean(aiConfigError)}>
                    <Plus size={16} aria-hidden="true" />
                    <span>Add Provider</span>
                  </button>
                </div>

                {showAiProviderForm ? (
                  <div className="ai-provider-form settings-section">
                    <div className="section-heading compact-heading">
                      <div>
                        <h3>New AI Provider</h3>
                        <p className="muted">Use environment variable references such as env:GEMINI_API_KEY instead of pasting secrets into the database.</p>
                      </div>
                      <button className="button ghost" type="button" onClick={() => setShowAiProviderForm(false)}>
                        <X size={16} aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    </div>
                    <div className="client-form-grid settings-section">
                      <input className="input" placeholder="Provider name" value={aiProviderDraft.name} onChange={(event) => setAiProviderDraft((current) => ({ ...current, name: event.target.value }))} />
                      <select
                        className="input"
                        value={aiProviderDraft.provider}
                        onChange={(event) => {
                          const defaults = aiProviderDefaults(event.target.value);
                          setAiProviderDraft((current) => ({ ...current, provider: event.target.value, ...defaults }));
                        }}
                      >
                        <option value="OPENAI_COMPATIBLE">OpenAI compatible</option>
                        <option value="ANTHROPIC">Anthropic Claude</option>
                        <option value="GEMINI">Google Gemini</option>
                        <option value="AZURE_OPENAI">Azure OpenAI</option>
                        <option value="OLLAMA">Ollama / local</option>
                        <option value="CUSTOM_HTTP">Custom HTTP</option>
                        <option value="MOCK">Mock</option>
                      </select>
                      <input className="input" placeholder="Base URL" value={aiProviderDraft.baseUrl} onChange={(event) => setAiProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))} />
                      <input
                        className="input"
                        placeholder="API key reference, e.g. env:GEMINI_API_KEY"
                        value={aiProviderDraft.apiKeyReference}
                        onChange={(event) => setAiProviderDraft((current) => ({ ...current, apiKeyReference: event.target.value }))}
                      />
                      <input className="input" placeholder="Default model" value={aiProviderDraft.defaultModel} onChange={(event) => setAiProviderDraft((current) => ({ ...current, defaultModel: event.target.value }))} />
                      <input className="input" placeholder="Timeout ms" value={aiProviderDraft.timeoutMs} onChange={(event) => setAiProviderDraft((current) => ({ ...current, timeoutMs: event.target.value }))} />
                      <label className="checkbox-row">
                        <input type="checkbox" checked={aiProviderDraft.isEnabled} onChange={(event) => setAiProviderDraft((current) => ({ ...current, isEnabled: event.target.checked }))} />
                        Enabled
                      </label>
                      <button className="button" type="button" onClick={createAiProvider} disabled={busy === "ai-provider" || Boolean(aiConfigError)}>
                        Save Provider
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="table-scroll settings-section">
                  <table className="tickets-table ai-providers-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Provider</th>
                        <th>Default Model</th>
                        <th>Status</th>
                        <th>Models</th>
                        <th>Connection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiProviders.length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            <span className="muted">No AI providers configured. The backend falls back to mock AI until a provider is registered.</span>
                          </td>
                        </tr>
                      ) : null}
                      {aiProviders.map((provider) => (
                        <tr key={provider.id}>
                          <td>
                            <strong>{provider.name}</strong>
                            <span className="muted">{provider.baseUrl ?? "Default provider endpoint"}</span>
                          </td>
                          <td>{AI_PROVIDER_LABELS[provider.provider] ?? provider.provider}</td>
                          <td>{provider.defaultModel ?? "No default model"}</td>
                          <td>
                            <span className="status-pill">{provider.isEnabled ? "Enabled" : "Disabled"}</span>
                          </td>
                          <td>
                            <div className="ai-model-cell">
                              <span className="muted">{provider.models.length ? provider.models.map((model) => `${model.name}${model.isDefault ? " (default)" : ""}`).join(", ") : "No extra models"}</span>
                              <div className="form-actions">
                                <input
                                  className="input compact-select"
                                  placeholder="Add model"
                                  value={aiModelDrafts[provider.id] ?? ""}
                                  onChange={(event) => setAiModelDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
                                />
                                <button className="button secondary" type="button" onClick={() => addAiModel(provider.id)} disabled={busy === `ai-model-${provider.id}` || Boolean(aiConfigError)}>
                                  Add
                                </button>
                              </div>
                            </div>
                          </td>
                          <td>
                            <button className="button secondary" type="button" onClick={() => testAiProvider(provider.id)} disabled={busy === `ai-test-${provider.id}` || Boolean(aiConfigError)}>
                              <TestTube2 size={16} aria-hidden="true" />
                              <span>{busy === `ai-test-${provider.id}` ? "Testing" : "Test"}</span>
                            </button>
                            {aiTestResults[provider.id] ? <span className={`ai-test-result ${aiTestResults[provider.id].status}`}>{aiTestResults[provider.id].message}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Ticket Writing Actions</h2>
                    <p className="muted">Assign one provider/model to individual actions or update multiple actions at once.</p>
                  </div>
                </div>
                <div className="ai-bulk-actions settings-section">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedAiActions.length === AI_ACTIONS.length}
                      onChange={(event) => setSelectedAiActions(event.target.checked ? AI_ACTIONS.map((action) => action.type) : [])}
                    />
                    Select all actions
                  </label>
                  <select
                    className="input compact-select"
                    value={aiBulkDraft.providerConfigId}
                    onChange={(event) => setAiBulkDraft((current) => ({ ...current, providerConfigId: event.target.value, modelConfigId: "" }))}
                  >
                    <option value="">Default provider</option>
                    {aiProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <select className="input compact-select" value={aiBulkDraft.modelConfigId} onChange={(event) => setAiBulkDraft((current) => ({ ...current, modelConfigId: event.target.value }))}>
                    <option value="">Default model</option>
                    {(bulkProvider?.models ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={aiBulkDraft.isEnabled} onChange={(event) => setAiBulkDraft((current) => ({ ...current, isEnabled: event.target.checked }))} />
                    Enabled
                  </label>
                  <button className="button secondary" type="button" onClick={applyBulkAiActionDraft} disabled={Boolean(aiConfigError)}>
                    Apply to Selected
                  </button>
                  <button className="button" type="button" onClick={saveBulkAiActions} disabled={busy === "ai-action-bulk" || Boolean(aiConfigError)}>
                    Save Bulk Changes
                  </button>
                </div>
                <div className="table-scroll settings-section">
                  <table className="tickets-table ai-actions-table">
                    <thead>
                      <tr>
                        <th>
                          <span className="sr-only">Select</span>
                        </th>
                        <th>Action</th>
                        <th>Provider</th>
                        <th>Model</th>
                        <th>Enabled</th>
                        <th>Save</th>
                      </tr>
                    </thead>
                    <tbody>
                  {AI_ACTIONS.map((action) => {
                    const actionType = action.type;
                    const draft = aiActionDrafts[actionType] ?? { providerConfigId: "", modelConfigId: "", isEnabled: true };
                    const selectedProvider = aiProviders.find((provider) => provider.id === draft.providerConfigId);
                    const availableModels = selectedProvider?.models ?? [];
                    return (
                      <tr key={actionType}>
                        <td>
                          <input type="checkbox" checked={selectedAiActions.includes(actionType)} onChange={(event) => toggleAiAction(actionType, event.target.checked)} aria-label={`Select ${action.label}`} />
                        </td>
                        <td>
                          <strong>{action.label}</strong>
                          <span className="muted">Ticket writing assistance</span>
                        </td>
                        <td>
                          <select
                            className="input compact-select"
                            value={draft.providerConfigId}
                            onChange={(event) =>
                              setAiActionDrafts((current) => ({
                                ...current,
                                [actionType]: { ...draft, providerConfigId: event.target.value, modelConfigId: "" }
                              }))
                            }
                          >
                            <option value="">Default provider</option>
                            {aiProviders.map((provider) => (
                              <option key={provider.id} value={provider.id}>
                                {provider.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="input compact-select"
                            value={draft.modelConfigId}
                            onChange={(event) =>
                              setAiActionDrafts((current) => ({
                                ...current,
                                [actionType]: { ...draft, modelConfigId: event.target.value }
                              }))
                            }
                          >
                            <option value="">Default model</option>
                            {availableModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={draft.isEnabled}
                              onChange={(event) =>
                                setAiActionDrafts((current) => ({
                                  ...current,
                                  [actionType]: { ...draft, isEnabled: event.target.checked }
                                }))
                              }
                            />
                            Enabled
                          </label>
                        </td>
                        <td>
                          <button className="button secondary" type="button" onClick={() => saveAiAction(actionType)} disabled={busy === `ai-action-${actionType}` || Boolean(aiConfigError)}>
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <h2>AI Safety</h2>
                <p className="muted">AI suggestions require human approval before sending. Attachment contents are not included by default; prompts use ticket context and the current draft only.</p>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
