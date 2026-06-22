"use client";

import { Download, Plus, RefreshCcw, RotateCw, TestTube2, Upload, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { EventServicesConfigPanel } from "@/components/settings/EventServicesConfigPanel";
import { KnowledgeConfigPanel } from "@/components/settings/KnowledgeConfigPanel";
import { RmmConfigPanel } from "@/components/settings/RmmConfigPanel";
import { SupportPortalConfigPanel } from "@/components/settings/SupportPortalConfigPanel";
import { UsersWorkspace } from "@/components/users/UsersWorkspace";
import { apiBaseUrl, apiFetch } from "@/lib/api";

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
  blockedSpamMessages?: number;
  attachmentBackfilled?: number;
  attachmentBackfillFailures?: number;
  attachmentBackfillErrors?: string[];
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
  isActive?: boolean;
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
  setPriority: string | null;
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

interface AutoReplyTemplate {
  id: string;
  name: string;
  scope: "GLOBAL" | "CLIENT" | "MAILBOX" | "AFTER_HOURS" | "PRIORITY";
  templateType: "TICKET" | "EVENT_SERVICE";
  trigger: "TICKET_CREATED" | "EVENT_REQUEST_CREATED" | "EVENT_STATUS_CHANGED";
  clientId: string | null;
  mailboxId: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isActive: boolean;
  client?: Client | null;
  mailbox?: { id: string; name: string; emailAddress: string } | null;
}

interface NotificationPreference {
  id: string;
  userId: string;
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
  inAppTicketAssignedToMe: boolean;
  inAppTicketAssignedToMyTeam: boolean;
  inAppTicketReplyOnAssignedTicket: boolean;
  inAppInternalNoteOnAssignedTicket: boolean;
  inAppInternalNoteMention: boolean;
  inAppRoutingRuleMatched: boolean;
  inAppTicketReopened: boolean;
  inAppNewTicketCreated: boolean;
  emailTicketAssignedToMe: boolean;
  emailTicketAssignedToMyTeam: boolean;
  emailTicketReplyOnAssignedTicket: boolean;
  emailInternalNoteOnAssignedTicket: boolean;
  emailInternalNoteMention: boolean;
  emailRoutingRuleMatched: boolean;
  emailTicketReopened: boolean;
  emailNewTicketCreated: boolean;
  inAppEventAssignedToMe: boolean;
  inAppEventRequestUpdated: boolean;
  inAppEventTaskAssignedToMe: boolean;
  inAppEventTaskUpdated: boolean;
  inAppEventCommentAdded: boolean;
  emailEventAssignedToMe: boolean;
  emailEventRequestUpdated: boolean;
  emailEventTaskAssignedToMe: boolean;
  emailEventTaskUpdated: boolean;
  emailEventCommentAdded: boolean;
  inAppNewEventRequestCreated: boolean;
  emailNewEventRequestCreated: boolean;
  dailyDigestEnabled: boolean;
}

interface UserNotificationPreferenceRow extends User {
  isActive: boolean;
  notificationPreference: NotificationPreference;
}

interface SpamBlockEntry {
  id: string;
  type: "EMAIL" | "DOMAIN";
  value: string;
  normalizedValue: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string; email: string } | null;
}

interface MaintenanceSummary {
  recycleBinRetentionDays: number;
  lastRecycleBinCleanupAt: string | null;
  deletedTickets: number;
  eligibleTickets: number;
  deletedAttachments: number;
  eligibleAttachments: number;
  cutoff: string;
}

interface GeneralSettings {
  applicationName: string;
  companyName: string;
  supportEmail: string;
  logoUrl: string | null;
  loginLogoUrl: string | null;
  loginFormLogoUrl: string | null;
  mobileLogoUrl: string | null;
  mobileLoginLogoUrl: string | null;
  appIconUrl: string | null;
  loginHeadline: string | null;
  loginSubtitle: string | null;
  loginFooterText: string | null;
  appSubtitle: string | null;
  showLoginBrandTitle: boolean;
  showSubtitleOnLogin: boolean;
  showSubtitleInApp: boolean;
  subtitlePlacement: "RIGHT" | "BELOW";
  mobileSubtitlePlacement: "RIGHT" | "BELOW";
  subtitleSize: number;
  subtitleColor: string;
  subtitleWeight: string;
  subtitleStyle: "normal" | "italic";
  subtitleFontFamily: string;
  loginLogoWidth: number;
  loginLogoHeight: number;
  loginFormLogoWidth: number;
  loginFormLogoHeight: number;
  brandTextSize: number;
  brandTextColor: string;
  brandLogoBackgroundColor: string;
  brandLogoTransparentBackground: boolean;
  appBrandTextSize: number;
  appBrandTextColor: string;
  mobileLogoWidth: number;
  mobileLogoHeight: number;
  mobileBrandTextSize: number;
  mobileBrandTextColor: string;
  mobileLoginLogoWidth: number;
  mobileLoginLogoHeight: number;
  mobileLoginBrandTextSize: number;
  mobileLoginBrandTextColor: string;
  brandFontFamily: string;
  loginHeadlineSize: number;
  loginHeadlineColor: string;
  loginHeadlineWeight: string;
  loginHeadlineStyle: "normal" | "italic";
  loginHeadlineFontFamily: string;
  loginSubtitleSize: number;
  loginSubtitleColor: string;
  loginSubtitleWeight: string;
  loginSubtitleStyle: "normal" | "italic";
  loginSubtitleAlign: "left" | "center" | "right";
  loginSubtitleFontFamily: string;
  loginFooterSize: number;
  loginFooterColor: string;
  loginFooterWeight: string;
  loginFooterStyle: "normal" | "italic";
  loginFooterFontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  supportButtonEnabled: boolean;
  supportButtonLabel: string;
  supportButtonUrl: string | null;
  defaultTimezone: string;
  defaultLanguage: string;
  defaultLandingPage: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
}

interface SecuritySettings {
  passwordResetEnabled: boolean;
  passwordResetTokenTtlMinutes: number;
  mfaUserManagedEnabled: boolean;
  mfaRequiredForAdmins: boolean;
  mfaRequiredForAllUsers: boolean;
  mfaTrustedDeviceDays: number;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretReference: string;
  turnstileProtectLogin: boolean;
  turnstileProtectPasswordReset: boolean;
}

interface AuditLogUserOption {
  id: string;
  name: string;
  email: string;
}

interface AuditLogItem {
  id: string;
  userId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface AuditLogResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  users: AuditLogUserOption[];
  actions: string[];
  entityTypes: string[];
}

interface SystemHealthComponent {
  key: string;
  name: string;
  status: "ok" | "warning" | "error";
  severity: "green" | "orange" | "red";
  message: string;
  checkedAt: string;
  metadata?: unknown;
}

interface SystemHealthSummary {
  status: "ok" | "warning" | "error";
  severity: "green" | "orange" | "red";
  checkedAt: string;
  serverTime: string;
  timezone: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  components: SystemHealthComponent[];
  recorded: boolean;
}

interface SystemHealthHistory {
  range: "daily" | "weekly" | "monthly" | "yearly";
  from: string;
  to: string;
  totals: { ok: number; warning: number; error: number };
  snapshots: Array<{
    id: string;
    component: string;
    status: "ok" | "warning" | "error";
    severity: "green" | "orange" | "red";
    message: string;
    checkedAt: string;
  }>;
}

interface SystemHealthTimeline {
  range: "daily" | "weekly" | "monthly" | "yearly";
  from: string;
  to: string;
  bucketHours: number;
  components: Array<{
    key: string;
    name: string;
    healthyPercent: number;
    warningCount: number;
    errorCount: number;
    unknownCount: number;
    buckets: Array<{
      id: string;
      start: string;
      end: string;
      status: "ok" | "warning" | "error" | "unknown";
      severity: "green" | "orange" | "red" | "gray";
      message: string;
      snapshotCount: number;
    }>;
  }>;
}

const SYSTEM_HEALTH_HISTORY_PAGE_SIZE = 10;

type ActiveSection =
  | "general"
  | "users"
  | "mailboxes"
  | "autoReplies"
  | "teams"
  | "routing"
  | "domains"
  | "supportPortal"
  | "rmm"
  | "notifications"
  | "events"
  | "knowledge"
  | "spam"
  | "maintenance"
  | "logs"
  | "security"
  | "ai"
  | "systemHealth";

const AI_ACTIONS = [
  { type: "paraphrase", label: "Paraphrase" },
  { type: "improve_reply", label: "Improve reply" },
  { type: "suggest_reply", label: "Draft reply" },
  { type: "complete_draft", label: "Autocomplete draft" },
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

const TICKET_NOTIFICATION_FIELDS: Array<{ label: string; inAppKey: keyof NotificationPreference; emailKey: keyof NotificationPreference }> = [
  { label: "New ticket created", inAppKey: "inAppNewTicketCreated", emailKey: "emailNewTicketCreated" },
  { label: "Assigned to me", inAppKey: "inAppTicketAssignedToMe", emailKey: "emailTicketAssignedToMe" },
  { label: "Assigned to my team", inAppKey: "inAppTicketAssignedToMyTeam", emailKey: "emailTicketAssignedToMyTeam" },
  { label: "Reply on assigned ticket", inAppKey: "inAppTicketReplyOnAssignedTicket", emailKey: "emailTicketReplyOnAssignedTicket" },
  { label: "Internal note on assigned ticket", inAppKey: "inAppInternalNoteOnAssignedTicket", emailKey: "emailInternalNoteOnAssignedTicket" },
  { label: "Mentioned on internal note", inAppKey: "inAppInternalNoteMention", emailKey: "emailInternalNoteMention" },
  { label: "Routing rule matched", inAppKey: "inAppRoutingRuleMatched", emailKey: "emailRoutingRuleMatched" },
  { label: "Ticket reopened", inAppKey: "inAppTicketReopened", emailKey: "emailTicketReopened" }
];

const EVENT_NOTIFICATION_FIELDS: Array<{ label: string; inAppKey: keyof NotificationPreference; emailKey: keyof NotificationPreference }> = [
  { label: "New event request created", inAppKey: "inAppNewEventRequestCreated", emailKey: "emailNewEventRequestCreated" },
  { label: "Event assigned to me", inAppKey: "inAppEventAssignedToMe", emailKey: "emailEventAssignedToMe" },
  { label: "Event request updated", inAppKey: "inAppEventRequestUpdated", emailKey: "emailEventRequestUpdated" },
  { label: "Event task assigned to me", inAppKey: "inAppEventTaskAssignedToMe", emailKey: "emailEventTaskAssignedToMe" },
  { label: "Event task updated", inAppKey: "inAppEventTaskUpdated", emailKey: "emailEventTaskUpdated" },
  { label: "Event comment added", inAppKey: "inAppEventCommentAdded", emailKey: "emailEventCommentAdded" }
];

const GENERAL_TABS = [
  { key: "identity", label: "Identity" },
  { key: "assets", label: "Assets" },
  { key: "app", label: "App Branding" },
  { key: "login", label: "Login Branding" },
  { key: "defaults", label: "Defaults" }
] as const;

type GeneralTab = (typeof GENERAL_TABS)[number]["key"];

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  applicationName: "Avidity IT Management Tool",
  companyName: "Avidity Technologies",
  supportEmail: "support@aviditytechnologies.com",
  logoUrl: null,
  loginLogoUrl: null,
  loginFormLogoUrl: null,
  mobileLogoUrl: null,
  mobileLoginLogoUrl: null,
  appIconUrl: null,
  loginHeadline: "Avidity IT Management Tool",
  loginSubtitle: "Secure service desk operations, client context, attachments, mail flow, reporting, and remote access readiness in one configurable platform.",
  loginFooterText: "Avidity Technologies",
  appSubtitle: null,
  showLoginBrandTitle: true,
  showSubtitleOnLogin: false,
  showSubtitleInApp: false,
  subtitlePlacement: "BELOW",
  mobileSubtitlePlacement: "BELOW",
  subtitleSize: 14,
  subtitleColor: "#cbd5e1",
  subtitleWeight: "400",
  subtitleStyle: "normal",
  subtitleFontFamily: "system",
  loginLogoWidth: 160,
  loginLogoHeight: 48,
  loginFormLogoWidth: 220,
  loginFormLogoHeight: 72,
  brandTextSize: 16,
  brandTextColor: "#ffffff",
  brandLogoBackgroundColor: "#ffffff",
  brandLogoTransparentBackground: false,
  appBrandTextSize: 16,
  appBrandTextColor: "#ffffff",
  mobileLogoWidth: 34,
  mobileLogoHeight: 34,
  mobileBrandTextSize: 16,
  mobileBrandTextColor: "#ffffff",
  mobileLoginLogoWidth: 140,
  mobileLoginLogoHeight: 44,
  mobileLoginBrandTextSize: 16,
  mobileLoginBrandTextColor: "#ffffff",
  brandFontFamily: "system",
  loginHeadlineSize: 48,
  loginHeadlineColor: "#ffffff",
  loginHeadlineWeight: "800",
  loginHeadlineStyle: "normal",
  loginHeadlineFontFamily: "system",
  loginSubtitleSize: 18,
  loginSubtitleColor: "#ffffff",
  loginSubtitleWeight: "400",
  loginSubtitleStyle: "normal",
  loginSubtitleAlign: "left",
  loginSubtitleFontFamily: "system",
  loginFooterSize: 18,
  loginFooterColor: "#ffffff",
  loginFooterWeight: "400",
  loginFooterStyle: "normal",
  loginFooterFontFamily: "system",
  primaryColor: "#155eef",
  secondaryColor: "#0f172a",
  supportButtonEnabled: true,
  supportButtonLabel: "Support",
  supportButtonUrl: null,
  defaultTimezone: "America/Chicago",
  defaultLanguage: "en",
  defaultLandingPage: "/dashboard",
  dateFormat: "MMM dd, yyyy",
  timeFormat: "12h"
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  passwordResetEnabled: true,
  passwordResetTokenTtlMinutes: 30,
  mfaUserManagedEnabled: true,
  mfaRequiredForAdmins: false,
  mfaRequiredForAllUsers: false,
  mfaTrustedDeviceDays: 30,
  turnstileEnabled: false,
  turnstileSiteKey: "",
  turnstileSecretReference: "",
  turnstileProtectLogin: false,
  turnstileProtectPasswordReset: false
};

const EMPTY_RULE_DRAFT = {
  name: "",
  subjectContains: "",
  bodyContains: "",
  senderDomain: "",
  assignUserId: "",
  assignTeamId: "",
  setPriority: "",
  isActive: true,
  priority: "100"
};

function normalizeSyncIntervalSeconds(value: string, unit: "seconds" | "minutes") {
  const parsed = Number(value);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed * (unit === "minutes" ? 60 : 1)) : 300;
  return Math.min(86400, Math.max(30, seconds));
}

function displayLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function NotificationPreferenceGroup({
  title,
  row,
  fields,
  onChange
}: {
  title: string;
  row: UserNotificationPreferenceRow;
  fields: Array<{ label: string; inAppKey: keyof NotificationPreference; emailKey: keyof NotificationPreference }>;
  onChange: (userId: string, key: keyof NotificationPreference, value: boolean) => void;
}) {
  return (
    <div className="notification-preference-group">
      <div className="notification-group-title">
        <h3>{title}</h3>
        <div>
          <span>In-app</span>
          <span>Email</span>
        </div>
      </div>
      <div className="notification-preference-header">
        <span>Notification</span>
        <span>In-app</span>
        <span>Email</span>
      </div>
      {fields.map((field) => (
        <div className="notification-preference-row" key={field.label}>
          <span>{field.label}</span>
          <NotificationSwitch checked={Boolean(row.notificationPreference[field.inAppKey])} onChange={(value) => onChange(row.id, field.inAppKey, value)} label={`${field.label} in-app`} />
          <NotificationSwitch checked={Boolean(row.notificationPreference[field.emailKey])} onChange={(value) => onChange(row.id, field.emailKey, value)} label={`${field.label} email`} />
        </div>
      ))}
    </div>
  );
}

function NotificationSwitch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      className={`notification-switch ${checked ? "is-on" : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function NotificationUserCard({
  row,
  busy,
  onChange,
  onSave
}: {
  row: UserNotificationPreferenceRow;
  busy: string | null;
  onChange: (userId: string, key: keyof NotificationPreference, value: boolean) => void;
  onSave: (row: UserNotificationPreferenceRow) => void;
}) {
  return (
    <article className="notification-user-card">
      <div className="notification-user-header">
        <div>
          <h3>
            {row.firstName} {row.lastName}
          </h3>
          <p className="muted">{row.email}</p>
        </div>
        <button className="button secondary" type="button" onClick={() => onSave(row)} disabled={busy === `notification-${row.id}`}>
          Save
        </button>
      </div>
      <div className="notification-channel-strip">
        <div className="notification-channel-item">
          <span>In-app</span>
          <NotificationSwitch checked={row.notificationPreference.inAppEnabled} onChange={(value) => onChange(row.id, "inAppEnabled", value)} label={`${row.email} in-app channel`} />
        </div>
        <div className="notification-channel-item">
          <span>Email</span>
          <NotificationSwitch checked={row.notificationPreference.emailEnabled} onChange={(value) => onChange(row.id, "emailEnabled", value)} label={`${row.email} email channel`} />
        </div>
        <div className="notification-channel-item">
          <span>Daily digest</span>
          <NotificationSwitch checked={row.notificationPreference.dailyDigestEnabled} onChange={(value) => onChange(row.id, "dailyDigestEnabled", value)} label={`${row.email} daily digest`} />
        </div>
      </div>
      <div className="notification-user-grid">
        <NotificationPreferenceGroup title="Ticket Notifications" row={row} fields={TICKET_NOTIFICATION_FIELDS} onChange={onChange} />
        <NotificationPreferenceGroup title="Event Service Notifications" row={row} fields={EVENT_NOTIFICATION_FIELDS} onChange={onChange} />
      </div>
    </article>
  );
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
  const [autoReplyTemplates, setAutoReplyTemplates] = useState<AutoReplyTemplate[]>([]);
  const [notificationPreferenceRows, setNotificationPreferenceRows] = useState<UserNotificationPreferenceRow[]>([]);
  const [spamEntries, setSpamEntries] = useState<SpamBlockEntry[]>([]);
  const [maintenanceSummary, setMaintenanceSummary] = useState<MaintenanceSummary | null>(null);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings | null>(null);
  const [generalDraft, setGeneralDraft] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null);
  const [securityDraft, setSecurityDraft] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);
  const [auditLogs, setAuditLogs] = useState<AuditLogResult | null>(null);
  const [expandedAuditLogId, setExpandedAuditLogId] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthSummary | null>(null);
  const [systemHealthHistory, setSystemHealthHistory] = useState<SystemHealthHistory | null>(null);
  const [systemHealthTimeline, setSystemHealthTimeline] = useState<SystemHealthTimeline | null>(null);
  const [systemHealthRange, setSystemHealthRange] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [systemHealthHistoryOpen, setSystemHealthHistoryOpen] = useState(false);
  const [systemHealthHistoryPage, setSystemHealthHistoryPage] = useState(1);
  const [auditFilters, setAuditFilters] = useState({
    startDate: "",
    endDate: "",
    userId: "",
    action: "",
    entityType: "",
    search: "",
    page: "1",
    pageSize: "25"
  });
  const [spamSearch, setSpamSearch] = useState("");
  const [spamTypeFilter, setSpamTypeFilter] = useState("");
  const [spamActiveFilter, setSpamActiveFilter] = useState("");
  const [spamDraft, setSpamDraft] = useState({ type: "EMAIL" as "EMAIL" | "DOMAIN", value: "", notes: "" });
  const [maintenanceDraft, setMaintenanceDraft] = useState("7");
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
  const [ruleDraft, setRuleDraft] = useState({ ...EMPTY_RULE_DRAFT });
  const [editingRoutingRuleId, setEditingRoutingRuleId] = useState<string | null>(null);
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
  const [showAutoReplyForm, setShowAutoReplyForm] = useState(false);
  const [editingAutoReplyId, setEditingAutoReplyId] = useState<string | null>(null);
  const [autoReplyDraft, setAutoReplyDraft] = useState({
    name: "",
    scope: "GLOBAL" as "GLOBAL" | "CLIENT",
    templateType: "TICKET" as "TICKET" | "EVENT_SERVICE",
    trigger: "TICKET_CREATED" as "TICKET_CREATED" | "EVENT_REQUEST_CREATED" | "EVENT_STATUS_CHANGED",
    clientId: "",
    mailboxId: "",
    subject: "Re: {{ticket.subject}}",
    bodyText:
      "Hello {{contact.firstName}},\n\nWe received your request {{ticket.number}} and our team will review it shortly.\n\nThank you,\n{{company.name}}",
    bodyHtml:
      "<p>Hello {{contact.firstName}},</p><p>We received your request {{ticket.number}} and our team will review it shortly.</p><p>Thank you,<br>{{company.name}}</p>",
    isActive: true
  });
  const [aiTestResults, setAiTestResults] = useState<Record<string, { status: "success" | "error" | "testing"; message: string }>>({});
  const [selectedClientByDomain, setSelectedClientByDomain] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("general");
  const [generalTab, setGeneralTab] = useState<GeneralTab>("identity");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigError, setAiConfigError] = useState<string | null>(null);

  const hasClients = useMemo(() => clients.length > 0, [clients.length]);
  const activeMailboxCount = mailboxes.filter((mailbox) => mailbox.isActive).length;
  const activeTeamCount = ticketTeams.filter((team) => team.isActive).length;
  const enabledAiProviderCount = aiProviders.filter((provider) => provider.isEnabled).length;
  const healthStatusLabel = systemHealth?.status ? systemHealth.status.toUpperCase() : loading ? "LOADING" : "NOT CHECKED";
  const auditPage = Number(auditLogs?.page ?? auditFilters.page);
  const auditPageSize = Number(auditLogs?.pageSize ?? auditFilters.pageSize);
  const auditTotal = auditLogs?.total ?? 0;
  const auditFirstItem = auditTotal === 0 ? 0 : (auditPage - 1) * auditPageSize + 1;
  const auditLastItem = auditTotal === 0 ? 0 : Math.min(auditTotal, auditPage * auditPageSize);
  const auditPageCount = Math.max(1, Math.ceil(auditTotal / auditPageSize));
  const systemHealthSnapshots = systemHealthHistory?.snapshots ?? [];
  const systemHealthHistoryPageCount = Math.max(1, Math.ceil(systemHealthSnapshots.length / SYSTEM_HEALTH_HISTORY_PAGE_SIZE));
  const visibleSystemHealthSnapshots = systemHealthSnapshots.slice((systemHealthHistoryPage - 1) * SYSTEM_HEALTH_HISTORY_PAGE_SIZE, systemHealthHistoryPage * SYSTEM_HEALTH_HISTORY_PAGE_SIZE);
  const bulkProvider = useMemo(() => aiProviders.find((provider) => provider.id === aiBulkDraft.providerConfigId), [aiBulkDraft.providerConfigId, aiProviders]);
  const filteredSpamEntries = useMemo(() => {
    const search = spamSearch.trim().toLowerCase();
    return spamEntries.filter((entry) => {
      const matchesSearch = !search || entry.value.toLowerCase().includes(search) || entry.normalizedValue.includes(search) || (entry.notes ?? "").toLowerCase().includes(search);
      const matchesType = !spamTypeFilter || entry.type === spamTypeFilter;
      const matchesActive = !spamActiveFilter || String(entry.isActive) === spamActiveFilter;
      return matchesSearch && matchesType && matchesActive;
    });
  }, [spamActiveFilter, spamEntries, spamSearch, spamTypeFilter]);

  function aiProviderDefaults(provider: string) {
    switch (provider) {
      case "GEMINI":
        return { baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKeyReference: "env:GEMINI_API_KEY", defaultModel: "gemini-2.5-flash" };
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

  function applyGeneralSettings(settings: GeneralSettings) {
    const merged = { ...DEFAULT_GENERAL_SETTINGS, ...settings };
    setGeneralSettings(merged);
    setGeneralDraft(merged);
  }

  function generalSettingsPayload(settings: GeneralSettings) {
    return {
      applicationName: settings.applicationName,
      companyName: settings.companyName,
      supportEmail: settings.supportEmail,
      logoUrl: settings.logoUrl,
      loginLogoUrl: settings.loginLogoUrl,
      loginFormLogoUrl: settings.loginFormLogoUrl,
      mobileLogoUrl: settings.mobileLogoUrl,
      mobileLoginLogoUrl: settings.mobileLoginLogoUrl,
      appIconUrl: settings.appIconUrl,
      loginHeadline: settings.loginHeadline,
      loginSubtitle: settings.loginSubtitle,
      loginFooterText: settings.loginFooterText,
      appSubtitle: settings.appSubtitle,
      showLoginBrandTitle: settings.showLoginBrandTitle,
      showSubtitleOnLogin: settings.showSubtitleOnLogin,
      showSubtitleInApp: settings.showSubtitleInApp,
      subtitlePlacement: settings.subtitlePlacement,
      mobileSubtitlePlacement: settings.mobileSubtitlePlacement,
      subtitleSize: settings.subtitleSize,
      subtitleColor: settings.subtitleColor,
      subtitleWeight: settings.subtitleWeight,
      subtitleStyle: settings.subtitleStyle,
      subtitleFontFamily: settings.subtitleFontFamily,
      loginLogoWidth: settings.loginLogoWidth,
      loginLogoHeight: settings.loginLogoHeight,
      loginFormLogoWidth: settings.loginFormLogoWidth,
      loginFormLogoHeight: settings.loginFormLogoHeight,
      brandTextSize: settings.brandTextSize,
      brandTextColor: settings.brandTextColor,
      brandLogoBackgroundColor: settings.brandLogoBackgroundColor,
      brandLogoTransparentBackground: settings.brandLogoTransparentBackground,
      appBrandTextSize: settings.appBrandTextSize,
      appBrandTextColor: settings.appBrandTextColor,
      mobileLogoWidth: settings.mobileLogoWidth,
      mobileLogoHeight: settings.mobileLogoHeight,
      mobileBrandTextSize: settings.mobileBrandTextSize,
      mobileBrandTextColor: settings.mobileBrandTextColor,
      mobileLoginLogoWidth: settings.mobileLoginLogoWidth,
      mobileLoginLogoHeight: settings.mobileLoginLogoHeight,
      mobileLoginBrandTextSize: settings.mobileLoginBrandTextSize,
      mobileLoginBrandTextColor: settings.mobileLoginBrandTextColor,
      brandFontFamily: settings.brandFontFamily,
      loginHeadlineSize: settings.loginHeadlineSize,
      loginHeadlineColor: settings.loginHeadlineColor,
      loginHeadlineWeight: settings.loginHeadlineWeight,
      loginHeadlineStyle: settings.loginHeadlineStyle,
      loginHeadlineFontFamily: settings.loginHeadlineFontFamily,
      loginSubtitleSize: settings.loginSubtitleSize,
      loginSubtitleColor: settings.loginSubtitleColor,
      loginSubtitleWeight: settings.loginSubtitleWeight,
      loginSubtitleStyle: settings.loginSubtitleStyle,
      loginSubtitleAlign: settings.loginSubtitleAlign,
      loginSubtitleFontFamily: settings.loginSubtitleFontFamily,
      loginFooterSize: settings.loginFooterSize,
      loginFooterColor: settings.loginFooterColor,
      loginFooterWeight: settings.loginFooterWeight,
      loginFooterStyle: settings.loginFooterStyle,
      loginFooterFontFamily: settings.loginFooterFontFamily,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      supportButtonEnabled: settings.supportButtonEnabled,
      supportButtonLabel: settings.supportButtonLabel,
      supportButtonUrl: settings.supportButtonUrl,
      defaultTimezone: settings.defaultTimezone,
      defaultLanguage: settings.defaultLanguage,
      defaultLandingPage: settings.defaultLandingPage,
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat
    };
  }

  function applySecuritySettings(settings: SecuritySettings) {
    const merged = { ...DEFAULT_SECURITY_SETTINGS, ...settings };
    setSecuritySettings(merged);
    setSecurityDraft(merged);
  }

  function securitySettingsPayload(settings: SecuritySettings) {
    const turnstileSecretReference = settings.turnstileSecretReference.trim();
    return {
      passwordResetEnabled: settings.passwordResetEnabled,
      passwordResetTokenTtlMinutes: Number(settings.passwordResetTokenTtlMinutes) || DEFAULT_SECURITY_SETTINGS.passwordResetTokenTtlMinutes,
      mfaUserManagedEnabled: settings.mfaUserManagedEnabled,
      mfaRequiredForAdmins: settings.mfaRequiredForAdmins,
      mfaRequiredForAllUsers: settings.mfaRequiredForAllUsers,
      mfaTrustedDeviceDays: Number(settings.mfaTrustedDeviceDays) || DEFAULT_SECURITY_SETTINGS.mfaTrustedDeviceDays,
      turnstileEnabled: settings.turnstileEnabled,
      turnstileSiteKey: settings.turnstileSiteKey.trim() || null,
      turnstileSecretReference: turnstileSecretReference || null,
      turnstileProtectLogin: settings.turnstileProtectLogin,
      turnstileProtectPasswordReset: settings.turnstileProtectPasswordReset
    };
  }

  function auditQueryString(nextFilters = auditFilters) {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    return params.toString();
  }

  async function loadAuditLogs(nextFilters = auditFilters) {
    const query = auditQueryString(nextFilters);
    const result = await apiFetch<AuditLogResult>(`/system-settings/audit-logs${query ? `?${query}` : ""}`);
    setAuditLogs(result);
  }

  async function loadSystemHealth(range = systemHealthRange) {
    const [summary, history, timeline] = await Promise.all([
      apiFetch<SystemHealthSummary>("/system-health/summary"),
      apiFetch<SystemHealthHistory>(`/system-health/history?range=${range}`),
      apiFetch<SystemHealthTimeline>(`/system-health/timeline?range=${range}`)
    ]);
    setSystemHealth(summary);
    setSystemHealthHistory(history);
    setSystemHealthTimeline(timeline);
  }

  async function runSystemHealthCheck() {
    setBusy("system-health");
    setError(null);
    try {
      const summary = await apiFetch<SystemHealthSummary>("/system-health/check", { method: "POST" });
      const [history, timeline] = await Promise.all([
        apiFetch<SystemHealthHistory>(`/system-health/history?range=${systemHealthRange}`),
        apiFetch<SystemHealthTimeline>(`/system-health/timeline?range=${systemHealthRange}`)
      ]);
      setSystemHealth(summary);
      setSystemHealthHistory(history);
      setSystemHealthTimeline(timeline);
      setNotice("System health check completed.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to run system health check.");
    } finally {
      setBusy(null);
    }
  }

  async function loadSettingsData() {
    setLoading(true);
    setError(null);
    try {
      const [mailboxData, clientData, unmappedData, userData, teamData, ruleData, autoReplyData, notificationPreferenceData] = await Promise.all([
        apiFetch<Mailbox[]>("/mailboxes"),
        apiFetch<Client[]>("/clients"),
        apiFetch<UnmappedDomain[]>("/client-domains/unmapped"),
        apiFetch<User[]>("/users"),
        apiFetch<TicketTeam[]>("/ticket-teams"),
        apiFetch<RoutingRule[]>("/ticket-routing-rules"),
        apiFetch<AutoReplyTemplate[]>("/auto-replies"),
        apiFetch<UserNotificationPreferenceRow[]>("/notification-preferences/users")
      ]);
      const [spamResult, maintenanceResult] = await Promise.allSettled([
        apiFetch<SpamBlockEntry[]>("/spam-blocklist"),
        apiFetch<MaintenanceSummary>("/maintenance/recycle-bin/summary")
      ]);
      setMailboxes(mailboxData);
      setClients(clientData);
      setUnmappedDomains(unmappedData);
      setUsers(userData);
      setTicketTeams(teamData);
      setRoutingRules(ruleData);
      setAutoReplyTemplates(autoReplyData);
      setNotificationPreferenceRows(notificationPreferenceData);
      setSpamEntries(spamResult.status === "fulfilled" ? spamResult.value : []);
      setMaintenanceSummary(maintenanceResult.status === "fulfilled" ? maintenanceResult.value : null);
      setMaintenanceDraft(maintenanceResult.status === "fulfilled" ? String(maintenanceResult.value.recycleBinRetentionDays) : "7");
      const [generalResult, securityResult, auditResult] = await Promise.allSettled([
        apiFetch<GeneralSettings>("/system-settings/general"),
        apiFetch<SecuritySettings>("/system-settings/security"),
        loadAuditLogs()
      ]);
      if (generalResult.status === "fulfilled") {
        applyGeneralSettings(generalResult.value);
      }
      if (securityResult.status === "fulfilled") {
        applySecuritySettings(securityResult.value);
      }
      if (auditResult.status === "rejected") {
        setAuditLogs(null);
      }
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

  async function saveGeneralSettings() {
    setBusy("general-settings");
    setNotice(null);
    setError(null);
    try {
      const saved = await apiFetch<GeneralSettings>("/system-settings/general", {
        method: "PATCH",
        body: JSON.stringify(generalSettingsPayload(generalDraft))
      });
      applyGeneralSettings(saved);
      setNotice("General settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save general settings.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSecuritySettings() {
    setBusy("security-settings");
    setNotice(null);
    setError(null);
    try {
      const saved = await apiFetch<SecuritySettings>("/system-settings/security", {
        method: "PATCH",
        body: JSON.stringify(securitySettingsPayload(securityDraft))
      });
      applySecuritySettings(saved);
      setNotice("Security settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save security settings.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadBrandingAsset(assetType: "logo" | "loginLogo" | "loginFormLogo" | "mobileLogo" | "mobileLoginLogo" | "appIcon", file: File | null) {
    if (!file) {
      return;
    }

    const fieldByType = {
      logo: "logoUrl",
      loginLogo: "loginLogoUrl",
      loginFormLogo: "loginFormLogoUrl",
      mobileLogo: "mobileLogoUrl",
      mobileLoginLogo: "mobileLoginLogoUrl",
      appIcon: "appIconUrl"
    } as const;
    const formData = new FormData();
    formData.set("file", file);
    setBusy(`branding-${assetType}`);
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<{ url: string }>(`/system-settings/branding-assets?type=${assetType}`, {
        method: "POST",
        body: formData
      });
      setGeneralDraft((current) => ({ ...current, [fieldByType[assetType]]: result.url }));
      setGeneralSettings((current) => (current ? { ...current, [fieldByType[assetType]]: result.url } : current));
      setNotice("Branding asset uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload branding asset.");
    } finally {
      setBusy(null);
    }
  }

  async function applyAuditFilters(nextFilters: typeof auditFilters) {
    setAuditFilters(nextFilters);
    setBusy("audit-logs");
    setError(null);
    try {
      await loadAuditLogs(nextFilters);
    } catch {
      setError("Unable to load event logs.");
    } finally {
      setBusy(null);
    }
  }

  function exportAuditLogs() {
    const query = auditQueryString(auditFilters);
    window.location.href = `${apiBaseUrl}/system-settings/audit-logs/export${query ? `?${query}` : ""}`;
  }

  function formatAuditLabel(value: string) {
    return value
      .replace(/[._-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function shortAuditId(value: string | null) {
    if (!value) {
      return "No record id";
    }
    return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
  }

  function metadataEntries(metadata: unknown) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return [];
    }
    return Object.entries(metadata as Record<string, unknown>);
  }

  function formatAuditMetadataValue(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return "None";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function formatAuditMetadata(metadata: unknown) {
    if (!metadata || typeof metadata !== "object") {
      return "";
    }
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return "";
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

  function routingRulePayload(clearEmptyValues = false) {
    const priority = Number(ruleDraft.priority);
    return {
      name: ruleDraft.name.trim(),
      subjectContains: ruleDraft.subjectContains.trim() || (clearEmptyValues ? null : undefined),
      bodyContains: ruleDraft.bodyContains.trim() || (clearEmptyValues ? null : undefined),
      senderDomain: ruleDraft.senderDomain.trim() || (clearEmptyValues ? null : undefined),
      assignUserId: ruleDraft.assignUserId || (clearEmptyValues ? null : undefined),
      assignTeamId: ruleDraft.assignTeamId || (clearEmptyValues ? null : undefined),
      setPriority: ruleDraft.setPriority || (clearEmptyValues ? null : undefined),
      isActive: ruleDraft.isActive,
      priority: Number.isFinite(priority) && priority > 0 ? Math.floor(priority) : 100
    };
  }

  async function submitRoutingRule() {
    if (!ruleDraft.name.trim()) {
      setError("Routing rule name is required.");
      return;
    }

    setBusy("routing-rule");
    setNotice(null);
    setError(null);
    try {
      await apiFetch(editingRoutingRuleId ? `/ticket-routing-rules/${editingRoutingRuleId}` : "/ticket-routing-rules", {
        method: editingRoutingRuleId ? "PATCH" : "POST",
        body: JSON.stringify(routingRulePayload(Boolean(editingRoutingRuleId)))
      });
      setRuleDraft({ ...EMPTY_RULE_DRAFT });
      setEditingRoutingRuleId(null);
      setNotice(editingRoutingRuleId ? "Routing rule updated." : "Routing rule created.");
      await loadSettingsData();
    } catch {
      setError(editingRoutingRuleId ? "Unable to update routing rule." : "Unable to create routing rule.");
    } finally {
      setBusy(null);
    }
  }

  function editRoutingRule(rule: RoutingRule) {
    setEditingRoutingRuleId(rule.id);
    setRuleDraft({
      name: rule.name,
      subjectContains: rule.subjectContains ?? "",
      bodyContains: rule.bodyContains ?? "",
      senderDomain: rule.senderDomain ?? "",
      assignUserId: rule.assignUser?.id ?? "",
      assignTeamId: rule.assignTeam?.id ?? "",
      setPriority: rule.setPriority ?? "",
      isActive: rule.isActive,
      priority: String(rule.priority)
    });
    setNotice(null);
    setError(null);
  }

  function cancelRoutingRuleEdit() {
    setEditingRoutingRuleId(null);
    setRuleDraft({ ...EMPTY_RULE_DRAFT });
  }

  async function deleteRoutingRule(rule: RoutingRule) {
    if (!window.confirm(`Delete routing rule "${rule.name}"? Existing tickets will keep their current assignments.`)) {
      return;
    }

    setBusy(rule.id);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/ticket-routing-rules/${rule.id}`, { method: "DELETE" });
      if (editingRoutingRuleId === rule.id) {
        cancelRoutingRuleEdit();
      }
      setNotice("Routing rule deleted.");
      await loadSettingsData();
    } catch {
      setError("Unable to delete routing rule.");
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
        `Mailbox sync completed: ${result.receivedMessages} received, ${result.createdTickets} tickets created, ${result.skippedDuplicates} duplicates skipped, ${result.blockedSpamMessages ?? 0} blocked${
          result.attachmentBackfilled ? `, ${result.attachmentBackfilled} attachments recovered` : ""
        }${
          result.attachmentBackfillFailures ? `, ${result.attachmentBackfillFailures} attachment backfill failures` : ""
        }.${
          result.attachmentBackfillErrors?.length ? ` Attachment errors: ${result.attachmentBackfillErrors.slice(0, 2).join(" | ")}` : ""
        }`
      );
      await loadSettingsData();
    } catch {
      setError("Unable to sync mailbox.");
    } finally {
      setBusy(null);
    }
  }

  async function createSpamEntry() {
    if (!spamDraft.value.trim()) {
      setError("Enter an email address or domain to block.");
      return;
    }

    setBusy("spam-create");
    setNotice(null);
    setError(null);
    try {
      await apiFetch("/spam-blocklist", {
        method: "POST",
        body: JSON.stringify({
          type: spamDraft.type,
          value: spamDraft.value,
          notes: spamDraft.notes || undefined
        })
      });
      setSpamDraft({ type: "EMAIL", value: "", notes: "" });
      setNotice("Spam block entry created.");
      await loadSettingsData();
    } catch {
      setError("Unable to create spam block entry. Check the value and duplicates.");
    } finally {
      setBusy(null);
    }
  }

  async function updateSpamEntry(entry: SpamBlockEntry, data: { isActive?: boolean; notes?: string }) {
    setBusy(entry.id);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/spam-blocklist/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      });
      setNotice("Spam block entry updated.");
      await loadSettingsData();
    } catch {
      setError("Unable to update spam block entry.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSpamEntry(entry: SpamBlockEntry) {
    if (!window.confirm(`Delete spam block entry ${entry.value}?`)) {
      return;
    }

    setBusy(entry.id);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/spam-blocklist/${entry.id}`, { method: "DELETE" });
      setNotice("Spam block entry deleted.");
      await loadSettingsData();
    } catch {
      setError("Unable to delete spam block entry.");
    } finally {
      setBusy(null);
    }
  }

  async function saveMaintenanceSettings() {
    const days = Number(maintenanceDraft);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("Retention days must be between 1 and 365.");
      return;
    }

    setBusy("maintenance-settings");
    setNotice(null);
    setError(null);
    try {
      await apiFetch("/maintenance/recycle-bin/settings", {
        method: "PATCH",
        body: JSON.stringify({ recycleBinRetentionDays: days })
      });
      setNotice("Maintenance settings saved.");
      await loadSettingsData();
    } catch {
      setError("Unable to save maintenance settings.");
    } finally {
      setBusy(null);
    }
  }

  async function cleanupRecycleBin() {
    const days = Number(maintenanceDraft || maintenanceSummary?.recycleBinRetentionDays || 7);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("Retention days must be between 1 and 365.");
      return;
    }
    if (!window.confirm(`Permanently delete recycle bin items older than ${days} day${days === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }

    setBusy("maintenance-cleanup");
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<{ deletedTickets: number; deletedAttachments: number; deletedStoredFiles: number }>("/maintenance/recycle-bin/cleanup", {
        method: "POST",
        body: JSON.stringify({ confirm: true, olderThanDays: days })
      });
      setNotice(`Recycle bin cleanup completed: ${result.deletedTickets} tickets, ${result.deletedAttachments} attachments, and ${result.deletedStoredFiles} stored files deleted.`);
      await loadSettingsData();
    } catch {
      setError("Unable to clean recycle bin.");
    } finally {
      setBusy(null);
    }
  }

  function resetAutoReplyDraft() {
    setEditingAutoReplyId(null);
    setAutoReplyDraft({
      name: "",
      scope: "GLOBAL",
      templateType: "TICKET",
      trigger: "TICKET_CREATED",
      clientId: "",
      mailboxId: "",
      subject: "Re: {{ticket.subject}}",
      bodyText:
        "Hello {{contact.firstName}},\n\nWe received your request {{ticket.number}} and our team will review it shortly.\n\nThank you,\n{{company.name}}",
      bodyHtml:
        "<p>Hello {{contact.firstName}},</p><p>We received your request {{ticket.number}} and our team will review it shortly.</p><p>Thank you,<br>{{company.name}}</p>",
      isActive: true
    });
  }

  function startEditingAutoReply(template: AutoReplyTemplate) {
    setEditingAutoReplyId(template.id);
    setShowAutoReplyForm(true);
    setAutoReplyDraft({
      name: template.name,
      scope: template.scope === "CLIENT" ? "CLIENT" : "GLOBAL",
      templateType: template.templateType ?? "TICKET",
      trigger: template.trigger ?? "TICKET_CREATED",
      clientId: template.clientId ?? "",
      mailboxId: template.mailboxId ?? "",
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
      isActive: template.isActive
    });
  }

  async function saveAutoReplyTemplate() {
    if (!autoReplyDraft.name.trim() || !autoReplyDraft.subject.trim() || !autoReplyDraft.bodyText.trim()) {
      setError("Auto-reply name, subject, and plain text body are required.");
      return;
    }
    if (autoReplyDraft.scope === "CLIENT" && !autoReplyDraft.clientId) {
      setError("Select a client for client-specific auto-replies.");
      return;
    }

    setBusy("auto-reply");
    setNotice(null);
    setError(null);
    try {
      const payload = {
        name: autoReplyDraft.name,
        scope: autoReplyDraft.scope,
        templateType: autoReplyDraft.templateType,
        trigger: autoReplyDraft.trigger,
        clientId: autoReplyDraft.scope === "CLIENT" ? autoReplyDraft.clientId : null,
        mailboxId: autoReplyDraft.mailboxId || null,
        subject: autoReplyDraft.subject,
        bodyText: autoReplyDraft.bodyText,
        bodyHtml: autoReplyDraft.bodyHtml || `<p>${autoReplyDraft.bodyText.replace(/\n/g, "<br>")}</p>`,
        isActive: autoReplyDraft.isActive
      };
      await apiFetch(editingAutoReplyId ? `/auto-replies/${editingAutoReplyId}` : "/auto-replies", {
        method: editingAutoReplyId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setNotice(editingAutoReplyId ? "Auto-reply template updated." : "Auto-reply template created.");
      resetAutoReplyDraft();
      setShowAutoReplyForm(false);
      await loadSettingsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save auto-reply template.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAutoReplyTemplate(templateId: string) {
    if (!window.confirm("Deactivate this auto-reply template? It will stop sending for new tickets.")) {
      return;
    }

    setBusy(templateId);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/auto-replies/${templateId}`, { method: "DELETE" });
      setNotice("Auto-reply template deactivated.");
      await loadSettingsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to deactivate auto-reply template.");
    } finally {
      setBusy(null);
    }
  }

  function updateNotificationPreferenceDraft(userId: string, key: keyof NotificationPreference, value: boolean) {
    setNotificationPreferenceRows((current) =>
      current.map((row) =>
        row.id === userId
          ? {
              ...row,
              notificationPreference: {
                ...row.notificationPreference,
                [key]: value
              }
            }
          : row
      )
    );
  }

  async function saveNotificationPreference(row: UserNotificationPreferenceRow) {
    setBusy(`notification-${row.id}`);
    setNotice(null);
    setError(null);
    try {
      const preference = row.notificationPreference;
      await apiFetch(`/notification-preferences/users/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          inAppEnabled: preference.inAppEnabled,
          emailEnabled: preference.emailEnabled,
          ticketAssignedToMe: preference.ticketAssignedToMe,
          ticketAssignedToMyTeam: preference.ticketAssignedToMyTeam,
          ticketReplyOnAssignedTicket: preference.ticketReplyOnAssignedTicket,
          internalNoteOnAssignedTicket: preference.internalNoteOnAssignedTicket,
          internalNoteMention: preference.internalNoteMention,
          routingRuleMatched: preference.routingRuleMatched,
          ticketReopened: preference.ticketReopened,
          newTicketCreated: preference.newTicketCreated,
          inAppTicketAssignedToMe: preference.inAppTicketAssignedToMe,
          inAppTicketAssignedToMyTeam: preference.inAppTicketAssignedToMyTeam,
          inAppTicketReplyOnAssignedTicket: preference.inAppTicketReplyOnAssignedTicket,
          inAppInternalNoteOnAssignedTicket: preference.inAppInternalNoteOnAssignedTicket,
          inAppInternalNoteMention: preference.inAppInternalNoteMention,
          inAppRoutingRuleMatched: preference.inAppRoutingRuleMatched,
          inAppTicketReopened: preference.inAppTicketReopened,
          inAppNewTicketCreated: preference.inAppNewTicketCreated,
          emailTicketAssignedToMe: preference.emailTicketAssignedToMe,
          emailTicketAssignedToMyTeam: preference.emailTicketAssignedToMyTeam,
          emailTicketReplyOnAssignedTicket: preference.emailTicketReplyOnAssignedTicket,
          emailInternalNoteOnAssignedTicket: preference.emailInternalNoteOnAssignedTicket,
          emailInternalNoteMention: preference.emailInternalNoteMention,
          emailRoutingRuleMatched: preference.emailRoutingRuleMatched,
          emailTicketReopened: preference.emailTicketReopened,
          emailNewTicketCreated: preference.emailNewTicketCreated,
          inAppEventAssignedToMe: preference.inAppEventAssignedToMe,
          inAppEventRequestUpdated: preference.inAppEventRequestUpdated,
          inAppEventTaskAssignedToMe: preference.inAppEventTaskAssignedToMe,
          inAppEventTaskUpdated: preference.inAppEventTaskUpdated,
          inAppEventCommentAdded: preference.inAppEventCommentAdded,
          emailEventAssignedToMe: preference.emailEventAssignedToMe,
          emailEventRequestUpdated: preference.emailEventRequestUpdated,
          emailEventTaskAssignedToMe: preference.emailEventTaskAssignedToMe,
          emailEventTaskUpdated: preference.emailEventTaskUpdated,
          emailEventCommentAdded: preference.emailEventCommentAdded,
          inAppNewEventRequestCreated: preference.inAppNewEventRequestCreated,
          emailNewEventRequestCreated: preference.emailNewEventRequestCreated,
          dailyDigestEnabled: preference.dailyDigestEnabled
        })
      });
      setNotice("Notification preferences saved.");
      await loadSettingsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save notification preferences.");
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

  useEffect(() => {
    const oneNoteStatus = new URLSearchParams(window.location.search).get("onenote");
    const requestedSection = new URLSearchParams(window.location.search).get("section");
    if (requestedSection === "systemHealth") {
      setActiveSection("systemHealth");
    }
    if (requestedSection === "rmm") {
      setActiveSection("rmm");
    }
    if (!oneNoteStatus) return;
    setActiveSection("knowledge");
    setNotice(oneNoteStatus === "connected" ? "Microsoft OneNote connected." : "Microsoft OneNote connection was not completed.");
  }, []);

  useEffect(() => {
    if (activeSection !== "systemHealth") return;
    loadSystemHealth(systemHealthRange).catch(() => setError("Unable to load system health information."));
  }, [activeSection, systemHealthRange]);

  useEffect(() => {
    setSystemHealthHistoryPage(1);
  }, [systemHealthRange]);

  useEffect(() => {
    if (systemHealthHistoryPage > systemHealthHistoryPageCount) {
      setSystemHealthHistoryPage(systemHealthHistoryPageCount);
    }
  }, [systemHealthHistoryPage, systemHealthHistoryPageCount]);

  return (
    <div className="settings-page">
      <div className="compact-page-header settings-page-header">
        <div>
          <span className="page-eyebrow">Administration</span>
          <h1>Settings</h1>
          <p className="muted">Configure identity, users, mail flow, portals, integrations, security, and operational health.</p>
        </div>
        <button className="button secondary settings-refresh-button" type="button" onClick={loadSettingsData} disabled={loading}>
          <RefreshCcw size={16} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="settings-summary-grid" aria-label="Settings summary">
        <div className="settings-summary-card">
          <span>Users</span>
          <strong>{users.length}</strong>
          <small>Directory accounts</small>
        </div>
        <div className="settings-summary-card">
          <span>Mailboxes</span>
          <strong>{activeMailboxCount}/{mailboxes.length}</strong>
          <small>Active inbound sources</small>
        </div>
        <div className="settings-summary-card">
          <span>Teams</span>
          <strong>{activeTeamCount}/{ticketTeams.length}</strong>
          <small>Active ticket teams</small>
        </div>
        <div className="settings-summary-card">
          <span>AI Providers</span>
          <strong>{enabledAiProviderCount}</strong>
          <small>Enabled configurations</small>
        </div>
        <div className="settings-summary-card">
          <span>System Health</span>
          <strong>{healthStatusLabel}</strong>
          <small>{systemHealth?.checkedAt ? `Checked ${new Date(systemHealth.checkedAt).toLocaleDateString()}` : "Awaiting check"}</small>
        </div>
      </section>

      <section className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button className={activeSection === "general" ? "active" : ""} type="button" onClick={() => setActiveSection("general")}>
            General
          </button>
          <button className={activeSection === "users" ? "active" : ""} type="button" onClick={() => setActiveSection("users")}>
            Users
          </button>
          <button className={activeSection === "mailboxes" ? "active" : ""} type="button" onClick={() => setActiveSection("mailboxes")}>
            Mailboxes
          </button>
          <button className={activeSection === "autoReplies" ? "active" : ""} type="button" onClick={() => setActiveSection("autoReplies")}>
            Auto Replies
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
          <button className={activeSection === "supportPortal" ? "active" : ""} type="button" onClick={() => setActiveSection("supportPortal")}>
            Support Portal
          </button>
          <button className={activeSection === "rmm" ? "active" : ""} type="button" onClick={() => setActiveSection("rmm")}>
            RMM Integration
          </button>
          <button className={activeSection === "notifications" ? "active" : ""} type="button" onClick={() => setActiveSection("notifications")}>
            Notifications
          </button>
          <button className={activeSection === "events" ? "active" : ""} type="button" onClick={() => setActiveSection("events")}>
            Events Config
          </button>
          <button className={activeSection === "knowledge" ? "active" : ""} type="button" onClick={() => setActiveSection("knowledge")}>
            Knowledge Config
          </button>
          <button className={activeSection === "spam" ? "active" : ""} type="button" onClick={() => setActiveSection("spam")}>
            Spam Management
          </button>
          <button className={activeSection === "maintenance" ? "active" : ""} type="button" onClick={() => setActiveSection("maintenance")}>
            Maintenance
          </button>
          <button className={activeSection === "logs" ? "active" : ""} type="button" onClick={() => setActiveSection("logs")}>
            Event Logs
          </button>
          <button className={activeSection === "security" ? "active" : ""} type="button" onClick={() => setActiveSection("security")}>
            Security
          </button>
          <button className={activeSection === "ai" ? "active" : ""} type="button" onClick={() => setActiveSection("ai")}>
            AI & Security
          </button>
          <button className={activeSection === "systemHealth" ? "active" : ""} type="button" onClick={() => setActiveSection("systemHealth")}>
            System Health
          </button>
        </nav>

        <div className="settings-content">
          {activeSection === "general" ? (
            <section className="panel general-settings-panel">
              <div className="section-heading">
                <div>
                  <h2>General Settings</h2>
                  <p className="muted">Manage identity, branding assets, login presentation, and default application behavior.</p>
                </div>
              </div>
              <div className="settings-subtabs" role="tablist" aria-label="General settings sections">
                {GENERAL_TABS.map((tab) => (
                  <button
                    className={generalTab === tab.key ? "active" : ""}
                    key={tab.key}
                    type="button"
                    onClick={() => setGeneralTab(tab.key)}
                    role="tab"
                    aria-selected={generalTab === tab.key}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="grid columns-2 general-settings-grid">
              {generalTab === "identity" ? (
              <div className="panel nested-panel">
                <div className="section-heading">
                  <div>
                    <h2>Application Identity</h2>
                    <p className="muted">Customize the visible product name, company name, support identity, and default colors.</p>
                  </div>
                </div>
                <div className="client-form-grid settings-section">
                  <label className="field">
                    <span>Application title</span>
                    <input className="input" value={generalDraft.applicationName} onChange={(event) => setGeneralDraft((current) => ({ ...current, applicationName: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Company name</span>
                    <input className="input" value={generalDraft.companyName} onChange={(event) => setGeneralDraft((current) => ({ ...current, companyName: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Support email</span>
                    <input className="input" type="email" value={generalDraft.supportEmail} onChange={(event) => setGeneralDraft((current) => ({ ...current, supportEmail: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Default landing page</span>
                    <select className="input" value={generalDraft.defaultLandingPage} onChange={(event) => setGeneralDraft((current) => ({ ...current, defaultLandingPage: event.target.value }))}>
                      <option value="/dashboard">Dashboard</option>
                      <option value="/tickets">Tickets</option>
                      <option value="/clients">Clients</option>
                      <option value="/reports">Reports</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Primary color</span>
                    <input className="input" type="color" value={generalDraft.primaryColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, primaryColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Secondary color</span>
                    <input className="input" type="color" value={generalDraft.secondaryColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, secondaryColor: event.target.value }))} />
                  </label>
                </div>
              </div>
              ) : null}

              {generalTab === "app" ? (
              <div className="panel nested-panel">
                <div className="section-heading">
                  <div>
                    <h2>App & Header Branding</h2>
                    <p className="muted">Control in-app sidebar/header logo behavior and subtitle presentation.</p>
                  </div>
                </div>
                <div className="client-form-grid settings-section">
                  <label className="field">
                    <span>Logo background color</span>
                    <input
                      className="input"
                      type="color"
                      value={generalDraft.brandLogoBackgroundColor}
                      disabled={generalDraft.brandLogoTransparentBackground}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, brandLogoBackgroundColor: event.target.value }))}
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={generalDraft.brandLogoTransparentBackground}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, brandLogoTransparentBackground: event.target.checked }))}
                    />
                    Transparent logo background
                  </label>
                  <label className="field full-span">
                    <span>Application subtitle</span>
                    <input className="input" value={generalDraft.appSubtitle ?? ""} onChange={(event) => setGeneralDraft((current) => ({ ...current, appSubtitle: event.target.value }))} />
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={generalDraft.showSubtitleOnLogin} onChange={(event) => setGeneralDraft((current) => ({ ...current, showSubtitleOnLogin: event.target.checked }))} />
                    Show subtitle on login
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={generalDraft.showSubtitleInApp} onChange={(event) => setGeneralDraft((current) => ({ ...current, showSubtitleInApp: event.target.checked }))} />
                    Show subtitle in app
                  </label>
                  <label className="field">
                    <span>Desktop subtitle placement</span>
                    <select className="input" value={generalDraft.subtitlePlacement} onChange={(event) => setGeneralDraft((current) => ({ ...current, subtitlePlacement: event.target.value as "RIGHT" | "BELOW" }))}>
                      <option value="BELOW">Below title</option>
                      <option value="RIGHT">Right of title</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Mobile subtitle placement</span>
                    <select className="input" value={generalDraft.mobileSubtitlePlacement} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileSubtitlePlacement: event.target.value as "RIGHT" | "BELOW" }))}>
                      <option value="BELOW">Below title</option>
                      <option value="RIGHT">Right of title</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>App title size</span>
                    <input className="input" type="number" min={12} max={32} value={generalDraft.appBrandTextSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, appBrandTextSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>App title color</span>
                    <input className="input" type="color" value={generalDraft.appBrandTextColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, appBrandTextColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Mobile app title size</span>
                    <input className="input" type="number" min={12} max={28} value={generalDraft.mobileBrandTextSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileBrandTextSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Mobile app title color</span>
                    <input className="input" type="color" value={generalDraft.mobileBrandTextColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileBrandTextColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Mobile app logo width</span>
                    <input className="input" type="number" min={20} max={160} value={generalDraft.mobileLogoWidth} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileLogoWidth: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Mobile app logo height</span>
                    <input className="input" type="number" min={20} max={120} value={generalDraft.mobileLogoHeight} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileLogoHeight: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Brand font</span>
                    <select className="input" value={generalDraft.brandFontFamily} onChange={(event) => setGeneralDraft((current) => ({ ...current, brandFontFamily: event.target.value }))}>
                      <option value="system">System</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Mono</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle font</span>
                    <select className="input" value={generalDraft.subtitleFontFamily} onChange={(event) => setGeneralDraft((current) => ({ ...current, subtitleFontFamily: event.target.value }))}>
                      <option value="system">System</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Mono</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle size</span>
                    <input className="input" type="number" min={10} max={28} value={generalDraft.subtitleSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, subtitleSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Subtitle color</span>
                    <input className="input" type="color" value={generalDraft.subtitleColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, subtitleColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Subtitle weight</span>
                    <select className="input" value={generalDraft.subtitleWeight} onChange={(event) => setGeneralDraft((current) => ({ ...current, subtitleWeight: event.target.value }))}>
                      {["300", "400", "500", "600", "700", "800"].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle style</span>
                    <select className="input" value={generalDraft.subtitleStyle} onChange={(event) => setGeneralDraft((current) => ({ ...current, subtitleStyle: event.target.value as "normal" | "italic" }))}>
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </label>
                </div>
              </div>
              ) : null}

              {generalTab === "assets" ? (
              <div className="panel nested-panel">
                <div className="section-heading">
                  <div>
                    <h2>Branding Assets</h2>
                    <p className="muted">Upload PNG, JPG, WebP, SVG, or ICO assets up to 2 MB.</p>
                  </div>
                </div>
                <div className="branding-asset-list settings-section">
                  {[
                    { type: "logo" as const, label: "App logo", value: generalDraft.logoUrl },
                    { type: "loginLogo" as const, label: "Login logo", value: generalDraft.loginLogoUrl },
                    { type: "loginFormLogo" as const, label: "Login form logo", value: generalDraft.loginFormLogoUrl },
                    { type: "mobileLogo" as const, label: "Mobile app logo", value: generalDraft.mobileLogoUrl },
                    { type: "mobileLoginLogo" as const, label: "Mobile login logo", value: generalDraft.mobileLoginLogoUrl },
                    { type: "appIcon" as const, label: "Browser icon", value: generalDraft.appIconUrl }
                  ].map((asset) => (
                    <div className="branding-asset-row" key={asset.type}>
                      <div
                        className="branding-preview"
                        style={{ background: generalDraft.brandLogoTransparentBackground ? "transparent" : generalDraft.brandLogoBackgroundColor }}
                      >
                        {asset.value ? <img src={asset.value} alt="" /> : <span>{generalDraft.applicationName.slice(0, 1)}</span>}
                      </div>
                      <div>
                        <strong>{asset.label}</strong>
                        <span className="muted">{asset.value || "No asset uploaded"}</span>
                      </div>
                      <label className="button secondary file-button">
                        <Upload size={16} aria-hidden="true" />
                        <span>{busy === `branding-${asset.type}` ? "Uploading" : "Upload"}</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico" onChange={(event) => void uploadBrandingAsset(asset.type, event.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              ) : null}

              {generalTab === "login" ? (
              <div className="panel nested-panel">
                <div className="section-heading">
                  <div>
                    <h2>Login Page</h2>
                    <p className="muted">Control the public login headline and supporting text.</p>
                  </div>
                </div>
                <div className="client-form-grid settings-section">
                  <label className="field">
                    <span>Login header logo width</span>
                    <input
                      className="input"
                      type="number"
                      min={24}
                      max={420}
                      value={generalDraft.loginLogoWidth}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, loginLogoWidth: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="field">
                    <span>Login header logo height</span>
                    <input
                      className="input"
                      type="number"
                      min={24}
                      max={180}
                      value={generalDraft.loginLogoHeight}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, loginLogoHeight: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="checkbox-row full-span">
                    <input type="checkbox" checked={generalDraft.showLoginBrandTitle} onChange={(event) => setGeneralDraft((current) => ({ ...current, showLoginBrandTitle: event.target.checked }))} />
                    Show application title next to the login logo
                  </label>
                  <label className="field">
                    <span>Login title size</span>
                    <input
                      className="input"
                      type="number"
                      min={12}
                      max={32}
                      value={generalDraft.brandTextSize}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, brandTextSize: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="field">
                    <span>Login title color</span>
                    <input className="input" type="color" value={generalDraft.brandTextColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, brandTextColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Mobile login logo width</span>
                    <input className="input" type="number" min={24} max={320} value={generalDraft.mobileLoginLogoWidth} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileLoginLogoWidth: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Mobile login logo height</span>
                    <input className="input" type="number" min={24} max={140} value={generalDraft.mobileLoginLogoHeight} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileLoginLogoHeight: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Mobile login title size</span>
                    <input className="input" type="number" min={12} max={28} value={generalDraft.mobileLoginBrandTextSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileLoginBrandTextSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Mobile login title color</span>
                    <input className="input" type="color" value={generalDraft.mobileLoginBrandTextColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, mobileLoginBrandTextColor: event.target.value }))} />
                  </label>
                  <label className="field full-span">
                    <span>Headline</span>
                    <input className="input" value={generalDraft.loginHeadline ?? ""} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginHeadline: event.target.value }))} />
                  </label>
                  <label className="field full-span">
                    <span>Subtitle</span>
                    <textarea className="textarea compact-textarea" value={generalDraft.loginSubtitle ?? ""} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitle: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Headline size</span>
                    <input className="input" type="number" min={24} max={72} value={generalDraft.loginHeadlineSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginHeadlineSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Headline color</span>
                    <input className="input" type="color" value={generalDraft.loginHeadlineColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginHeadlineColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Headline weight</span>
                    <select className="input" value={generalDraft.loginHeadlineWeight} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginHeadlineWeight: event.target.value }))}>
                      {["400", "500", "600", "700", "800", "900"].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Headline style</span>
                    <select className="input" value={generalDraft.loginHeadlineStyle} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginHeadlineStyle: event.target.value as "normal" | "italic" }))}>
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Headline font</span>
                    <select className="input" value={generalDraft.loginHeadlineFontFamily} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginHeadlineFontFamily: event.target.value }))}>
                      <option value="system">System</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Mono</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle weight</span>
                    <select className="input" value={generalDraft.loginSubtitleWeight} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitleWeight: event.target.value }))}>
                      {["300", "400", "500", "600", "700"].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle size</span>
                    <input className="input" type="number" min={12} max={32} value={generalDraft.loginSubtitleSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitleSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Subtitle color</span>
                    <input className="input" type="color" value={generalDraft.loginSubtitleColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitleColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Subtitle alignment</span>
                    <select className="input" value={generalDraft.loginSubtitleAlign} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitleAlign: event.target.value as "left" | "center" | "right" }))}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle style</span>
                    <select className="input" value={generalDraft.loginSubtitleStyle} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitleStyle: event.target.value as "normal" | "italic" }))}>
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Subtitle font</span>
                    <select className="input" value={generalDraft.loginSubtitleFontFamily} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginSubtitleFontFamily: event.target.value }))}>
                      <option value="system">System</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Mono</option>
                    </select>
                  </label>
                  <label className="field full-span">
                    <span>Footer text</span>
                    <input className="input" value={generalDraft.loginFooterText ?? ""} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFooterText: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Footer size</span>
                    <input className="input" type="number" min={10} max={28} value={generalDraft.loginFooterSize} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFooterSize: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Footer color</span>
                    <input className="input" type="color" value={generalDraft.loginFooterColor} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFooterColor: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Footer weight</span>
                    <select className="input" value={generalDraft.loginFooterWeight} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFooterWeight: event.target.value }))}>
                      {["300", "400", "500", "600", "700"].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Footer style</span>
                    <select className="input" value={generalDraft.loginFooterStyle} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFooterStyle: event.target.value as "normal" | "italic" }))}>
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Footer font</span>
                    <select className="input" value={generalDraft.loginFooterFontFamily} onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFooterFontFamily: event.target.value }))}>
                      <option value="system">System</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Mono</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Form logo width</span>
                    <input
                      className="input"
                      type="number"
                      min={48}
                      max={420}
                      value={generalDraft.loginFormLogoWidth}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFormLogoWidth: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="field">
                    <span>Form logo height</span>
                    <input
                      className="input"
                      type="number"
                      min={32}
                      max={180}
                      value={generalDraft.loginFormLogoHeight}
                      onChange={(event) => setGeneralDraft((current) => ({ ...current, loginFormLogoHeight: Number(event.target.value) }))}
                    />
                  </label>
                </div>
              </div>
              ) : null}

              {generalTab === "defaults" ? (
              <div className="panel nested-panel">
                <div className="section-heading">
                  <div>
                    <h2>Defaults & Support</h2>
                    <p className="muted">Set app defaults and the top-bar support button behavior.</p>
                  </div>
                </div>
                <div className="client-form-grid settings-section">
                  <label className="field">
                    <span>Timezone</span>
                    <input className="input" value={generalDraft.defaultTimezone} onChange={(event) => setGeneralDraft((current) => ({ ...current, defaultTimezone: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Language</span>
                    <input className="input" value={generalDraft.defaultLanguage} onChange={(event) => setGeneralDraft((current) => ({ ...current, defaultLanguage: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Date format</span>
                    <input className="input" value={generalDraft.dateFormat} onChange={(event) => setGeneralDraft((current) => ({ ...current, dateFormat: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Time format</span>
                    <select className="input" value={generalDraft.timeFormat} onChange={(event) => setGeneralDraft((current) => ({ ...current, timeFormat: event.target.value as "12h" | "24h" }))}>
                      <option value="12h">12-hour</option>
                      <option value="24h">24-hour</option>
                    </select>
                  </label>
                  <label className="checkbox-row full-span">
                    <input type="checkbox" checked={generalDraft.supportButtonEnabled} onChange={(event) => setGeneralDraft((current) => ({ ...current, supportButtonEnabled: event.target.checked }))} />
                    Show support button in the header
                  </label>
                  <label className="field">
                    <span>Support button label</span>
                    <input className="input" value={generalDraft.supportButtonLabel} onChange={(event) => setGeneralDraft((current) => ({ ...current, supportButtonLabel: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>Support button URL</span>
                    <input className="input" placeholder="https://..." value={generalDraft.supportButtonUrl ?? ""} onChange={(event) => setGeneralDraft((current) => ({ ...current, supportButtonUrl: event.target.value }))} />
                  </label>
                </div>
              </div>
              ) : null}
              </div>
              <div className="settings-actions settings-section settings-save-bar">
                <button className="button" type="button" onClick={saveGeneralSettings} disabled={busy === "general-settings"}>
                  Save General Settings
                </button>
                {generalSettings ? <span className="muted">Current application title: {generalSettings.applicationName}</span> : null}
              </div>
            </section>
          ) : null}

          {activeSection === "users" ? <UsersWorkspace /> : null}

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

          {activeSection === "autoReplies" ? (
            <section className="panel settings-section">
              <div className="section-heading">
                <div>
                  <h2>Auto Replies</h2>
                  <p className="muted">Send automatic acknowledgement emails when a new inbound ticket is created.</p>
                </div>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    resetAutoReplyDraft();
                    setShowAutoReplyForm(true);
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>Add Template</span>
                </button>
              </div>

              {showAutoReplyForm ? (
                <div className="access-form settings-section">
                  <div className="client-form-grid">
                    <input className="input" placeholder="Template name" value={autoReplyDraft.name} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, name: event.target.value }))} />
                    <select className="input" value={autoReplyDraft.scope} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, scope: event.target.value as "GLOBAL" | "CLIENT" }))}>
                      <option value="GLOBAL">Global auto-reply</option>
                      <option value="CLIENT">Client-specific auto-reply</option>
                    </select>
                    <select
                      className="input"
                      value={autoReplyDraft.templateType}
                      onChange={(event) =>
                        setAutoReplyDraft((current) => ({
                          ...current,
                          templateType: event.target.value as "TICKET" | "EVENT_SERVICE",
                          trigger: event.target.value === "EVENT_SERVICE" ? "EVENT_REQUEST_CREATED" : "TICKET_CREATED",
                          subject: event.target.value === "EVENT_SERVICE" ? "Event request received: {{event.trackingNumber}}" : "Re: {{ticket.subject}}"
                        }))
                      }
                    >
                      <option value="TICKET">Ticket auto-reply</option>
                      <option value="EVENT_SERVICE">Event Services auto-reply</option>
                    </select>
                    <select className="input" value={autoReplyDraft.trigger} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, trigger: event.target.value as typeof autoReplyDraft.trigger }))}>
                      {autoReplyDraft.templateType === "EVENT_SERVICE" ? (
                        <>
                          <option value="EVENT_REQUEST_CREATED">New event request</option>
                          <option value="EVENT_STATUS_CHANGED">Event status changed</option>
                        </>
                      ) : (
                        <option value="TICKET_CREATED">New ticket created</option>
                      )}
                    </select>
                    <select
                      className="input"
                      value={autoReplyDraft.clientId}
                      onChange={(event) => setAutoReplyDraft((current) => ({ ...current, clientId: event.target.value }))}
                      disabled={autoReplyDraft.scope !== "CLIENT"}
                    >
                      <option value="">Select client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    <select className="input" value={autoReplyDraft.mailboxId} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, mailboxId: event.target.value }))}>
                      <option value="">Any mailbox</option>
                      {mailboxes.map((mailbox) => (
                        <option key={mailbox.id} value={mailbox.id}>
                          {mailbox.name} ({mailbox.emailAddress})
                        </option>
                      ))}
                    </select>
                    <input className="input" placeholder="Subject" value={autoReplyDraft.subject} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, subject: event.target.value }))} />
                    <label className="checkbox-row">
                      <input type="checkbox" checked={autoReplyDraft.isActive} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                      Active
                    </label>
                  </div>
                  <label className="field-stack">
                    <span>Plain text body</span>
                    <textarea className="input" rows={7} value={autoReplyDraft.bodyText} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, bodyText: event.target.value }))} />
                  </label>
                  <label className="field-stack">
                    <span>HTML body</span>
                    <textarea className="input" rows={7} value={autoReplyDraft.bodyHtml} onChange={(event) => setAutoReplyDraft((current) => ({ ...current, bodyHtml: event.target.value }))} />
                  </label>
                  <p className="muted">
                    Variables: {"{{ticket.number}}"}, {"{{ticket.subject}}"}, {"{{event.trackingNumber}}"}, {"{{event.name}}"}, {"{{event.date}}"}, {"{{event.time}}"}, {"{{event.services}}"}, {"{{event.url}}"}, {"{{requester.firstName}}"}, {"{{client.name}}"}, {"{{company.name}}"}, {"{{support.email}}"}
                  </p>
                  <div className="form-actions">
                    <button className="button" type="button" onClick={saveAutoReplyTemplate} disabled={busy === "auto-reply"}>
                      {editingAutoReplyId ? "Save Template" : "Create Template"}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        resetAutoReplyDraft();
                        setShowAutoReplyForm(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="table-scroll settings-section">
                <table className="tickets-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Scope</th>
                      <th>Client</th>
                      <th>Mailbox</th>
                      <th>Status</th>
                      <th>Subject</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoReplyTemplates.length === 0 ? (
                      <tr>
                        <td colSpan={8}>No auto-reply templates configured.</td>
                      </tr>
                    ) : null}
                    {autoReplyTemplates.map((template) => (
                      <tr key={template.id}>
                        <td>
                          <strong>{template.name}</strong>
                        </td>
                        <td>
                          <span className="status-pill">{template.templateType === "EVENT_SERVICE" ? "Event Services" : "Tickets"}</span>
                          <span className="muted">{displayLabel(template.trigger)}</span>
                        </td>
                        <td>{template.scope === "CLIENT" ? "Client" : "Global"}</td>
                        <td>{template.client?.name ?? "All clients"}</td>
                        <td>{template.mailbox?.name ?? "Any mailbox"}</td>
                        <td>
                          <span className={`status-pill ${template.isActive ? "success" : "muted-pill"}`}>{template.isActive ? "Active" : "Inactive"}</span>
                        </td>
                        <td>{template.subject}</td>
                        <td>
                          <div className="form-actions">
                            <button className="button secondary" type="button" onClick={() => startEditingAutoReply(template)}>
                              Edit
                            </button>
                            <button className="button danger" type="button" title="Deactivate template" onClick={() => deleteAutoReplyTemplate(template.id)} disabled={busy === template.id || !template.isActive}>
                              <X size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <span className={`status-pill ${team.isActive ? "success" : "muted-pill"}`}>{team.isActive ? "Active" : "Inactive"}</span>
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
          <select className="input" value={ruleDraft.isActive ? "active" : "inactive"} onChange={(event) => setRuleDraft((current) => ({ ...current, isActive: event.target.value === "active" }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <input
            className="input"
            min="1"
            placeholder="Priority"
            type="number"
            value={ruleDraft.priority}
            onChange={(event) => setRuleDraft((current) => ({ ...current, priority: event.target.value }))}
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
          <button className="button" type="button" onClick={submitRoutingRule} disabled={busy === "routing-rule"}>
            {editingRoutingRuleId ? "Update Rule" : "Create Rule"}
          </button>
          {editingRoutingRuleId ? (
            <button className="button secondary" type="button" onClick={cancelRoutingRuleEdit} disabled={busy === "routing-rule"}>
              Cancel
            </button>
          ) : null}
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
              <span className="muted">{rule.setPriority ? `Sets priority to ${rule.setPriority.toLowerCase()}` : "Keeps current priority"}</span>
              <div className="row-actions">
                <button className="button secondary small-button" type="button" onClick={() => editRoutingRule(rule)} disabled={busy === rule.id}>
                  Edit
                </button>
                <button className="button secondary danger-soft small-button" type="button" onClick={() => deleteRoutingRule(rule)} disabled={busy === rule.id}>
                  Delete
                </button>
              </div>
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

          {activeSection === "supportPortal" ? <SupportPortalConfigPanel /> : null}

          {activeSection === "rmm" ? <RmmConfigPanel /> : null}

          {activeSection === "notifications" ? (
            <section className="panel settings-section">
              <div className="section-heading">
                <div>
                  <h2>Notifications</h2>
                  <p className="muted">Control ticket and Event Services notifications by user and delivery channel.</p>
                </div>
                <span className="status-pill">{notificationPreferenceRows.length} users</span>
              </div>
              <div className="notification-user-list settings-section">
                {notificationPreferenceRows.length === 0 ? <p className="muted">No users available for notification settings.</p> : null}
                {notificationPreferenceRows.map((row) => (
                  <NotificationUserCard
                    key={row.id}
                    row={row}
                    busy={busy}
                    onChange={updateNotificationPreferenceDraft}
                    onSave={(nextRow) => void saveNotificationPreference(nextRow)}
                  />
                ))}
              </div>
              <p className="muted settings-section">
                Email notifications use the active outbound support mailbox. If outbound mail is disabled or Graph permissions fail, in-app notifications still continue.
              </p>
            </section>
          ) : null}

          {activeSection === "spam" ? (
            <section className="grid">
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Spam Management</h2>
                    <p className="muted">Block sender emails or domains before inbound mail creates tickets.</p>
                  </div>
                  <span className="count-pill">{spamEntries.length} entries</span>
                </div>

                <div className="client-form-grid settings-section">
                  <select className="input compact-select" value={spamDraft.type} onChange={(event) => setSpamDraft((current) => ({ ...current, type: event.target.value as "EMAIL" | "DOMAIN" }))}>
                    <option value="EMAIL">Email address</option>
                    <option value="DOMAIN">Domain</option>
                  </select>
                  <input className="input" placeholder={spamDraft.type === "EMAIL" ? "person@example.com" : "example.com"} value={spamDraft.value} onChange={(event) => setSpamDraft((current) => ({ ...current, value: event.target.value }))} />
                  <input className="input" placeholder="Reason or notes" value={spamDraft.notes} onChange={(event) => setSpamDraft((current) => ({ ...current, notes: event.target.value }))} />
                  <button className="button" type="button" onClick={createSpamEntry} disabled={busy === "spam-create"}>
                    <Plus size={16} aria-hidden="true" />
                    <span>Add Block</span>
                  </button>
                </div>

                <div className="client-form-grid settings-section">
                  <input className="input" placeholder="Search blocked senders" value={spamSearch} onChange={(event) => setSpamSearch(event.target.value)} />
                  <select className="input compact-select" value={spamTypeFilter} onChange={(event) => setSpamTypeFilter(event.target.value)}>
                    <option value="">All types</option>
                    <option value="EMAIL">Email</option>
                    <option value="DOMAIN">Domain</option>
                  </select>
                  <select className="input compact-select" value={spamActiveFilter} onChange={(event) => setSpamActiveFilter(event.target.value)}>
                    <option value="">All states</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>

                <div className="table-scroll settings-section">
                  <table className="tickets-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Notes</th>
                        <th>Status</th>
                        <th>Created By</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSpamEntries.length === 0 ? (
                        <tr>
                          <td colSpan={7}>No spam block entries found.</td>
                        </tr>
                      ) : null}
                      {filteredSpamEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.type === "EMAIL" ? "Email" : "Domain"}</td>
                          <td>
                            <strong>{entry.value}</strong>
                            <span className="muted">{entry.normalizedValue}</span>
                          </td>
                          <td>
                            <textarea
                              className="textarea compact-textarea"
                              defaultValue={entry.notes ?? ""}
                              onBlur={(event) => {
                                if (event.target.value !== (entry.notes ?? "")) {
                                  void updateSpamEntry(entry, { notes: event.target.value });
                                }
                              }}
                            />
                          </td>
                          <td>
                            <span className={`status-pill ${entry.isActive ? "read-pill" : "muted-pill"}`}>{entry.isActive ? "Active" : "Inactive"}</span>
                          </td>
                          <td>{entry.createdBy ? `${entry.createdBy.firstName} ${entry.createdBy.lastName}` : "System"}</td>
                          <td>{new Date(entry.updatedAt).toLocaleString()}</td>
                          <td>
                            <div className="settings-actions">
                              <button className="button secondary" type="button" onClick={() => updateSpamEntry(entry, { isActive: !entry.isActive })} disabled={busy === entry.id}>
                                {entry.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button className="button secondary danger-button" type="button" onClick={() => deleteSpamEntry(entry)} disabled={busy === entry.id}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "events" ? <EventServicesConfigPanel /> : null}

          {activeSection === "knowledge" ? <KnowledgeConfigPanel /> : null}

          {activeSection === "maintenance" ? (
            <section className="grid columns-2">
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Recycle Bin Cleanup</h2>
                    <p className="muted">Permanently remove soft-deleted tickets and attachments after the retention window.</p>
                  </div>
                </div>
                <div className="metric-grid settings-section">
                  <div className="panel subtle-panel metric">
                    <span className="muted">Deleted tickets</span>
                    <strong>{maintenanceSummary?.deletedTickets ?? 0}</strong>
                  </div>
                  <div className="panel subtle-panel metric">
                    <span className="muted">Eligible tickets</span>
                    <strong>{maintenanceSummary?.eligibleTickets ?? 0}</strong>
                  </div>
                  <div className="panel subtle-panel metric">
                    <span className="muted">Deleted attachments</span>
                    <strong>{maintenanceSummary?.deletedAttachments ?? 0}</strong>
                  </div>
                  <div className="panel subtle-panel metric">
                    <span className="muted">Eligible attachments</span>
                    <strong>{maintenanceSummary?.eligibleAttachments ?? 0}</strong>
                  </div>
                </div>
                <label className="field settings-section">
                  <span>Auto-clean retention days</span>
                  <input className="input compact-select" type="number" min={1} max={365} value={maintenanceDraft} onChange={(event) => setMaintenanceDraft(event.target.value)} />
                </label>
                <p className="muted">
                  Current cutoff: {maintenanceSummary?.cutoff ? new Date(maintenanceSummary.cutoff).toLocaleString() : "Not calculated"}. Last cleanup:{" "}
                  {maintenanceSummary?.lastRecycleBinCleanupAt ? new Date(maintenanceSummary.lastRecycleBinCleanupAt).toLocaleString() : "Never"}.
                </p>
                <div className="settings-actions settings-section">
                  <button className="button secondary" type="button" onClick={saveMaintenanceSettings} disabled={busy === "maintenance-settings"}>
                    Save Retention
                  </button>
                  <button className="button danger-button" type="button" onClick={cleanupRecycleBin} disabled={busy === "maintenance-cleanup"}>
                    Clear Eligible Items
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2>Safety Rules</h2>
                <div className="stack-list settings-section settings-rule-list">
                  <div className="stack-row">
                    <strong>Manual cleanup requires confirmation</strong>
                    <span className="muted">The app prompts before any permanent deletion.</span>
                  </div>
                  <div className="stack-row">
                    <strong>Automatic cleanup uses retention</strong>
                    <span className="muted">Only recycle bin items older than the configured retention period are eligible.</span>
                  </div>
                  <div className="stack-row">
                    <strong>Files are removed with records</strong>
                    <span className="muted">Associated stored files are deleted before the database records are removed.</span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "logs" ? (
            <section className="panel settings-section audit-logs-panel">
              <div className="section-heading">
                <div>
                  <h2>Event Logs</h2>
                  <p className="muted">Review administrative and system activity across the application.</p>
                </div>
                <div className="settings-actions compact-actions">
                  <span className="status-pill">{auditTotal} events</span>
                  <button className="button secondary" type="button" onClick={exportAuditLogs} disabled={!auditLogs?.items.length}>
                    <Download size={16} aria-hidden="true" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className="audit-filter-grid settings-section">
                <label className="field audit-date-field">
                  <span>Start date</span>
                  <input className="input" type="date" value={auditFilters.startDate} onChange={(event) => setAuditFilters((current) => ({ ...current, startDate: event.target.value, page: "1" }))} />
                </label>
                <label className="field audit-date-field">
                  <span>End date</span>
                  <input className="input" type="date" value={auditFilters.endDate} onChange={(event) => setAuditFilters((current) => ({ ...current, endDate: event.target.value, page: "1" }))} />
                </label>
                <label className="field">
                  <span>User</span>
                  <select className="input" value={auditFilters.userId} onChange={(event) => setAuditFilters((current) => ({ ...current, userId: event.target.value, page: "1" }))}>
                    <option value="">All users</option>
                    {(auditLogs?.users ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Action</span>
                  <select className="input" value={auditFilters.action} onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value, page: "1" }))}>
                    <option value="">All actions</option>
                    {(auditLogs?.actions ?? []).map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Entity</span>
                  <select className="input" value={auditFilters.entityType} onChange={(event) => setAuditFilters((current) => ({ ...current, entityType: event.target.value, page: "1" }))}>
                    <option value="">All entities</option>
                    {(auditLogs?.entityTypes ?? []).map((entityType) => (
                      <option key={entityType} value={entityType}>
                        {entityType}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field audit-search-field">
                  <span>Search</span>
                  <input className="input" placeholder="Action, entity, IP, user agent..." value={auditFilters.search} onChange={(event) => setAuditFilters((current) => ({ ...current, search: event.target.value, page: "1" }))} />
                </label>
                <label className="field audit-page-size-field">
                  <span>Rows</span>
                  <select className="input" value={auditFilters.pageSize} onChange={(event) => void applyAuditFilters({ ...auditFilters, page: "1", pageSize: event.target.value })}>
                    <option value="25">25 rows</option>
                    <option value="50">50 rows</option>
                    <option value="100">100 rows</option>
                  </select>
                </label>
                <div className="audit-filter-actions">
                  <button className="button" type="button" onClick={() => void applyAuditFilters(auditFilters)} disabled={busy === "audit-logs"}>
                    Apply Filters
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void applyAuditFilters({ startDate: "", endDate: "", userId: "", action: "", entityType: "", search: "", page: "1", pageSize: auditFilters.pageSize })}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="settings-actions settings-section audit-pagination audit-pagination-top">
                <span className="muted">
                  Showing {auditFirstItem}-{auditLastItem} of {auditTotal} events.
                </span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={auditPage <= 1 || busy === "audit-logs"}
                  onClick={() => void applyAuditFilters({ ...auditFilters, page: String(Math.max(1, auditPage - 1)) })}
                >
                  Previous
                </button>
                <span className="status-pill">Page {auditPage} of {auditPageCount}</span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!auditLogs || auditPage >= auditPageCount || busy === "audit-logs"}
                  onClick={() => void applyAuditFilters({ ...auditFilters, page: String(auditPage + 1) })}
                >
                  Next
                </button>
              </div>

              <div className="table-scroll settings-section">
                <table className="tickets-table audit-log-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>IP</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs?.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="audit-empty-cell">
                          <span className="muted">No events match the current filters.</span>
                        </td>
                      </tr>
                    ) : null}
                    {(auditLogs?.items ?? []).map((log) => {
                      const expanded = expandedAuditLogId === log.id;
                      const metadata = formatAuditMetadata(log.metadata);
                      const entries = metadataEntries(log.metadata);
                      return (
                        <Fragment key={log.id}>
                          <tr className={expanded ? "audit-row expanded" : "audit-row"}>
                            <td className="audit-time-cell">
                              <strong>{new Date(log.createdAt).toLocaleDateString()}</strong>
                              <span className="muted">{new Date(log.createdAt).toLocaleTimeString()}</span>
                            </td>
                            <td className="audit-user-cell">
                              <strong>{log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() || log.user.email : "System"}</strong>
                              <span className="muted">{log.user?.email ?? "No user context"}</span>
                            </td>
                            <td className="audit-action-cell">
                              <span className="audit-action-pill" title={log.action}>{formatAuditLabel(log.action)}</span>
                              <span className="muted">{log.action}</span>
                            </td>
                            <td className="audit-entity-cell">
                              <strong>{formatAuditLabel(log.entityType)}</strong>
                              <span className="muted" title={log.entityId ?? undefined}>{shortAuditId(log.entityId)}</span>
                            </td>
                            <td className="audit-ip-cell">
                              <span className={log.ipAddress ? "audit-ip-pill" : "muted"}>{log.ipAddress ?? "Unavailable"}</span>
                            </td>
                            <td className="audit-details-cell">
                              {metadata ? (
                                <button className="button secondary small-button" type="button" onClick={() => setExpandedAuditLogId(expanded ? null : log.id)}>
                                  {expanded ? "Hide details" : "View details"}
                                </button>
                              ) : (
                                <span className="muted">No metadata</span>
                              )}
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="audit-metadata-row">
                              <td colSpan={6}>
                                <div className="audit-metadata-panel">
                                  <div className="audit-metadata-grid">
                                    {entries.length > 0
                                      ? entries.map(([key, value]) => (
                                          <div className="audit-metadata-item" key={key}>
                                            <span>{formatAuditLabel(key)}</span>
                                            <strong>{formatAuditMetadataValue(value)}</strong>
                                          </div>
                                        ))
                                      : null}
                                  </div>
                                  <details className="audit-metadata-raw">
                                    <summary>Raw JSON</summary>
                                    <pre>{metadata}</pre>
                                  </details>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="settings-actions settings-section audit-pagination">
                <span className="muted">
                  Showing {auditFirstItem}-{auditLastItem} of {auditTotal} events.
                </span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={auditPage <= 1 || busy === "audit-logs"}
                  onClick={() => void applyAuditFilters({ ...auditFilters, page: String(Math.max(1, auditPage - 1)) })}
                >
                  Previous
                </button>
                <span className="status-pill">Page {auditPage} of {auditPageCount}</span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!auditLogs || auditPage >= auditPageCount || busy === "audit-logs"}
                  onClick={() => void applyAuditFilters({ ...auditFilters, page: String(auditPage + 1) })}
                >
                  Next
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === "security" ? (
            <section className="grid">
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Login Security</h2>
                    <p className="muted">Control password reset, per-user MFA, and Cloudflare Turnstile checks without storing raw secrets in the app.</p>
                  </div>
                  <span className={`status-pill ${securitySettings ? "success" : "muted-pill"}`}>{securitySettings ? "Loaded" : "Defaults"}</span>
                </div>

                <div className="grid columns-2 settings-section">
                  <div className="panel subtle-panel">
                    <h3>Password Reset</h3>
                    <p className="muted">Users receive a short-lived email link when reset is enabled.</p>
                    <div className="client-form-grid settings-section">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={securityDraft.passwordResetEnabled}
                          onChange={(event) => setSecurityDraft((current) => ({ ...current, passwordResetEnabled: event.target.checked }))}
                        />
                        Enable forgot password flow
                      </label>
                      <label>
                        Reset link TTL minutes
                        <input
                          className="input"
                          type="number"
                          min={5}
                          max={240}
                          value={securityDraft.passwordResetTokenTtlMinutes}
                          onChange={(event) => setSecurityDraft((current) => ({ ...current, passwordResetTokenTtlMinutes: Number(event.target.value) }))}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="panel subtle-panel">
                    <h3>Two-Factor Authentication</h3>
                    <p className="muted">Users can enable MFA in Profile. Admins can reset MFA from Users when recovery is needed.</p>
                    <div className="stack settings-section">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={securityDraft.mfaUserManagedEnabled}
                          onChange={(event) => setSecurityDraft((current) => ({ ...current, mfaUserManagedEnabled: event.target.checked }))}
                        />
                        Allow users to manage their own 2FA
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={securityDraft.mfaRequiredForAdmins}
                          onChange={(event) => setSecurityDraft((current) => ({ ...current, mfaRequiredForAdmins: event.target.checked }))}
                        />
                        Require 2FA for administrator roles
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={securityDraft.mfaRequiredForAllUsers}
                          onChange={(event) => setSecurityDraft((current) => ({ ...current, mfaRequiredForAllUsers: event.target.checked }))}
                        />
                        Require 2FA for all users
                      </label>
                      {securityDraft.mfaRequiredForAllUsers ? (
                        <p className="warning-text">Only enable after users have configured 2FA, otherwise they will be blocked at sign-in until an admin resets or disables the requirement.</p>
                      ) : null}
                      <label>
                        Trust device duration days
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={90}
                          value={securityDraft.mfaTrustedDeviceDays}
                          onChange={(event) => setSecurityDraft((current) => ({ ...current, mfaTrustedDeviceDays: Number(event.target.value) }))}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="panel subtle-panel settings-section">
                  <div className="section-heading">
                    <div>
                      <h3>Cloudflare Turnstile</h3>
                      <p className="muted">Protect login and password reset with Turnstile. Store the secret in the server environment and save only its reference here.</p>
                    </div>
                    <span className={`status-pill ${securityDraft.turnstileEnabled ? "success" : "muted-pill"}`}>{securityDraft.turnstileEnabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div className="client-form-grid settings-section">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={securityDraft.turnstileEnabled}
                        onChange={(event) => setSecurityDraft((current) => ({ ...current, turnstileEnabled: event.target.checked }))}
                      />
                      Enable Cloudflare Turnstile
                    </label>
                    <span />
                    <label>
                      Site key
                      <input
                        className="input"
                        value={securityDraft.turnstileSiteKey}
                        onChange={(event) => setSecurityDraft((current) => ({ ...current, turnstileSiteKey: event.target.value }))}
                        placeholder="0x4AAAA..."
                      />
                    </label>
                    <label>
                      Secret reference
                      <input
                        className="input"
                        value={securityDraft.turnstileSecretReference}
                        onChange={(event) => setSecurityDraft((current) => ({ ...current, turnstileSecretReference: event.target.value }))}
                        placeholder="env:TURNSTILE_SECRET_KEY"
                      />
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={securityDraft.turnstileProtectLogin}
                        onChange={(event) => setSecurityDraft((current) => ({ ...current, turnstileProtectLogin: event.target.checked }))}
                      />
                      Protect sign-in
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={securityDraft.turnstileProtectPasswordReset}
                        onChange={(event) => setSecurityDraft((current) => ({ ...current, turnstileProtectPasswordReset: event.target.checked }))}
                      />
                      Protect forgot password
                    </label>
                  </div>
                  <p className="muted settings-section">Example production environment value: TURNSTILE_SECRET_KEY=your-cloudflare-secret. Save env:TURNSTILE_SECRET_KEY in this form.</p>
                </div>

                <div className="settings-actions">
                  <button className="button" type="button" onClick={saveSecuritySettings} disabled={busy === "security-settings"}>
                    Save Security Settings
                  </button>
                </div>
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
                            <span className={`status-pill ${provider.isEnabled ? "success" : "muted-pill"}`}>{provider.isEnabled ? "Enabled" : "Disabled"}</span>
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

          {activeSection === "systemHealth" ? (
            <section className="grid">
              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>System Health</h2>
                    <p className="muted">Monitor application services, portals, integrations, and automatic health snapshots.</p>
                  </div>
                  <div className="settings-actions compact-actions">
                    <span className={`system-health-badge ${systemHealth?.status ?? "warning"}`}>
                      <span aria-hidden="true" />
                      {systemHealth?.status ? systemHealth.status.toUpperCase() : "LOADING"}
                    </span>
                    <button className="button secondary" type="button" onClick={runSystemHealthCheck} disabled={busy === "system-health"}>
                      <RefreshCcw size={16} aria-hidden="true" />
                      <span>Run Check</span>
                    </button>
                  </div>
                </div>

                <div className="system-health-summary settings-section">
                  <div className="panel subtle-panel metric system-health-time-metric">
                    <span className="muted">Server time</span>
                    <strong>{systemHealth?.serverTime ? new Date(systemHealth.serverTime).toLocaleString() : "Loading"}</strong>
                    <span className="muted">{systemHealth?.timezone ?? "Timezone unavailable"}</span>
                  </div>
                  <div className="panel subtle-panel metric system-health-time-metric">
                    <span className="muted">Last check</span>
                    <strong>{systemHealth?.checkedAt ? new Date(systemHealth.checkedAt).toLocaleString() : "Never"}</strong>
                    <span className="muted">{systemHealth?.recorded ? "Recorded snapshot" : "Live summary"}</span>
                  </div>
                  <div className="panel subtle-panel metric">
                    <span className="muted">Warnings</span>
                    <strong>{systemHealth?.components.filter((component) => component.status === "warning").length ?? 0}</strong>
                    <span className="muted">Needs review</span>
                  </div>
                  <div className="panel subtle-panel metric">
                    <span className="muted">Errors</span>
                    <strong>{systemHealth?.components.filter((component) => component.status === "error").length ?? 0}</strong>
                    <span className="muted">Needs action</span>
                  </div>
                </div>

                <div className="panel subtle-panel system-health-timeline-panel settings-section">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>System Status Timeline</h3>
                      <p className="muted">Component availability from automatic and manual snapshots in the selected range.</p>
                    </div>
                    <span className="muted">
                      {systemHealthTimeline ? `${new Date(systemHealthTimeline.from).toLocaleDateString()} - ${new Date(systemHealthTimeline.to).toLocaleDateString()}` : "Loading"}
                    </span>
                  </div>
                  <div className="system-health-timeline">
                    {(systemHealthTimeline?.components ?? []).map((component) => (
                      <div className="system-health-timeline-row" key={component.key}>
                        <div className="system-health-timeline-meta">
                          <span className="system-health-timeline-title">
                            <span className={`system-health-led ${component.errorCount > 0 ? "error" : component.warningCount > 0 ? "warning" : component.unknownCount === component.buckets.length ? "unknown" : "ok"}`} aria-hidden="true" />
                            <strong>{component.name}</strong>
                          </span>
                          <span className="muted">
                            {component.unknownCount === component.buckets.length ? "No snapshots yet" : `${component.healthyPercent}% healthy`}
                          </span>
                        </div>
                        <div className="system-health-timeline-bars" role="img" aria-label={`${component.name} health timeline`}>
                          {component.buckets.map((bucket) => (
                            <span
                              className={`system-health-timeline-bar ${bucket.status}`}
                              key={bucket.id}
                              title={`${component.name}: ${bucket.status} from ${new Date(bucket.start).toLocaleString()} to ${new Date(bucket.end).toLocaleString()}. ${bucket.message}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {systemHealthTimeline?.components.length === 0 ? <p className="muted">Run a check to start building the status timeline.</p> : null}
                  </div>
                </div>

                <div className="system-health-component-grid settings-section">
                  {(systemHealth?.components ?? []).map((component) => (
                    <article className={`system-health-card ${component.status}`} key={component.key}>
                      <div>
                        <span className="system-health-led" aria-hidden="true" />
                        <strong>{component.name}</strong>
                      </div>
                      <p>{component.message}</p>
                      <span className="muted">Checked {new Date(component.checkedAt).toLocaleString()}</span>
                    </article>
                  ))}
                  {!systemHealth ? <p className="muted">Loading system health components...</p> : null}
                </div>
              </div>

              <div className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Health History</h2>
                    <p className="muted">Automatic and manual checks are stored as snapshots for operational review.</p>
                  </div>
                  <div className="settings-actions compact-actions">
                    <button className="button secondary" type="button" onClick={() => setSystemHealthHistoryOpen((current) => !current)}>
                      <span>{systemHealthHistoryOpen ? "Hide Health History" : "View Health History"}</span>
                    </button>
                    <div className="segmented-control">
                      {(["daily", "weekly", "monthly", "yearly"] as const).map((range) => (
                        <button className={systemHealthRange === range ? "active" : ""} type="button" key={range} onClick={() => setSystemHealthRange(range)}>
                          {range[0].toUpperCase() + range.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="system-health-history-summary settings-section">
                  <div className="system-health-history-counts">
                    <span className="status-pill success">OK {systemHealthHistory?.totals.ok ?? 0}</span>
                    <span className="status-pill warning-pill">Warnings {systemHealthHistory?.totals.warning ?? 0}</span>
                    <span className="status-pill danger-pill">Errors {systemHealthHistory?.totals.error ?? 0}</span>
                  </div>
                  <span className="muted">
                    {systemHealthHistory ? `${systemHealthSnapshots.length} snapshots in ${systemHealthRange} range` : "Loading health history"}
                  </span>
                </div>

                {systemHealthHistoryOpen ? (
                  <>
                    <div className="table-scroll settings-section">
                      <table className="tickets-table system-health-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Component</th>
                            <th>Status</th>
                            <th>Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {systemHealthSnapshots.length === 0 ? (
                            <tr>
                              <td colSpan={4}>
                                <span className="muted">No health snapshots in this range. Run a check to record the current state.</span>
                              </td>
                            </tr>
                          ) : null}
                          {visibleSystemHealthSnapshots.map((snapshot) => (
                            <tr key={snapshot.id}>
                              <td>{new Date(snapshot.checkedAt).toLocaleString()}</td>
                              <td>{snapshot.component}</td>
                              <td>
                                <span className={`system-health-inline-status ${snapshot.status}`}>
                                  <span aria-hidden="true" />
                                  {snapshot.status}
                                </span>
                              </td>
                              <td>{snapshot.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="system-health-history-pagination settings-section">
                      <span className="muted">
                        Page {systemHealthHistoryPage} of {systemHealthHistoryPageCount}
                      </span>
                      <div className="settings-actions compact-actions">
                        <button className="button secondary" type="button" onClick={() => setSystemHealthHistoryPage((page) => Math.max(1, page - 1))} disabled={systemHealthHistoryPage <= 1}>
                          Previous
                        </button>
                        <button className="button secondary" type="button" onClick={() => setSystemHealthHistoryPage((page) => Math.min(systemHealthHistoryPageCount, page + 1))} disabled={systemHealthHistoryPage >= systemHealthHistoryPageCount}>
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
