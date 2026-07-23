"use client";

import { Archive, Check, History, Pencil, Plus, RefreshCcw, RotateCcw, Save, Trash2, Workflow, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface TicketStatusDefinition {
  id: string;
  key: string;
  name: string;
  description: string | null;
  systemStatus: string;
  category: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isProtected: boolean;
  isActive: boolean;
  archivedAt: string | null;
  _count: { tickets: number; rulesAsTarget: number };
}

interface TicketWorkflowRule {
  id: string;
  name: string;
  trigger: string;
  fromStatusIds: string[];
  targetStatusId: string;
  targetStatus: TicketStatusDefinition;
  requirePriorPublicReply: boolean | null;
  reopenWindowDays: number | null;
  priority: number;
  stopProcessing: boolean;
  isActive: boolean;
}

interface WorkflowHistoryItem {
  id: string;
  action: string;
  entityType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

type PanelTab = "STATUSES" | "RULES" | "HISTORY";

const SYSTEM_STATUS_OPTIONS = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "WAITING_ON_TECHNICIAN",
  "WAITING_ON_THIRD_PARTY",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED"
];

const TRIGGERS = [
  "CUSTOMER_REPLIED",
  "TECHNICIAN_REPLIED",
  "TICKET_ASSIGNED",
  "MANUAL_REOPEN"
];

const EMPTY_STATUS_DRAFT = {
  name: "",
  description: "",
  systemStatus: "IN_PROGRESS",
  color: "#2563EB",
  sortOrder: "100",
  isDefault: false
};

const EMPTY_RULE_DRAFT = {
  name: "",
  trigger: "CUSTOMER_REPLIED",
  fromStatusIds: [] as string[],
  targetStatusId: "",
  priorReply: "ANY",
  reopenWindowDays: "",
  priority: "100",
  stopProcessing: true,
  isActive: true
};

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function readableAction(value: string) {
  return value.split(".").map(label).join(" / ");
}

export function TicketWorkflowConfigPanel() {
  const [tab, setTab] = useState<PanelTab>("STATUSES");
  const [statuses, setStatuses] = useState<TicketStatusDefinition[]>([]);
  const [rules, setRules] = useState<TicketWorkflowRule[]>([]);
  const [historyItems, setHistoryItems] = useState<WorkflowHistoryItem[]>([]);
  const [statusDraft, setStatusDraft] = useState(EMPTY_STATUS_DRAFT);
  const [ruleDraft, setRuleDraft] = useState(EMPTY_RULE_DRAFT);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeStatuses = useMemo(() => statuses.filter((status) => status.isActive), [statuses]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [statusData, ruleData, historyData] = await Promise.all([
        apiFetch<TicketStatusDefinition[]>("/ticket-workflow/statuses?includeInactive=true"),
        apiFetch<TicketWorkflowRule[]>("/ticket-workflow/rules"),
        apiFetch<WorkflowHistoryItem[]>("/ticket-workflow/history")
      ]);
      setStatuses(statusData);
      setRules(ruleData);
      setHistoryItems(historyData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load ticket workflow configuration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetStatusForm() {
    setEditingStatusId(null);
    setStatusDraft(EMPTY_STATUS_DRAFT);
    setShowStatusForm(false);
  }

  function editStatus(status: TicketStatusDefinition) {
    setEditingStatusId(status.id);
    setStatusDraft({
      name: status.name,
      description: status.description ?? "",
      systemStatus: status.systemStatus,
      color: status.color,
      sortOrder: String(status.sortOrder),
      isDefault: status.isDefault
    });
    setShowStatusForm(true);
  }

  async function saveStatus(event: FormEvent) {
    event.preventDefault();
    setBusy("STATUS");
    setError(null);
    setNotice(null);
    try {
      await apiFetch(editingStatusId ? `/ticket-workflow/statuses/${editingStatusId}` : "/ticket-workflow/statuses", {
        method: editingStatusId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: statusDraft.name,
          description: statusDraft.description || null,
          ...(editingStatusId ? {} : { systemStatus: statusDraft.systemStatus }),
          color: statusDraft.color,
          sortOrder: Number(statusDraft.sortOrder || 0),
          isDefault: statusDraft.isDefault
        })
      });
      setNotice(editingStatusId ? "Ticket status updated." : "Ticket status created.");
      resetStatusForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save ticket status.");
    } finally {
      setBusy(null);
    }
  }

  async function removeStatus(status: TicketStatusDefinition) {
    const action = status._count.tickets || status._count.rulesAsTarget ? "archive" : "delete";
    if (!window.confirm(`${action === "archive" ? "Archive" : "Delete"} ${status.name}?`)) return;
    setBusy(status.id);
    setError(null);
    try {
      await apiFetch(`/ticket-workflow/statuses/${status.id}`, { method: "DELETE" });
      setNotice(action === "archive" ? "Ticket status archived. Related active rules were disabled." : "Ticket status deleted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove ticket status.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreStatus(status: TicketStatusDefinition) {
    setBusy(status.id);
    setError(null);
    try {
      await apiFetch(`/ticket-workflow/statuses/${status.id}/restore`, { method: "POST" });
      setNotice("Ticket status restored.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to restore ticket status.");
    } finally {
      setBusy(null);
    }
  }

  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleDraft(EMPTY_RULE_DRAFT);
    setShowRuleForm(false);
  }

  function editRule(rule: TicketWorkflowRule) {
    setEditingRuleId(rule.id);
    setRuleDraft({
      name: rule.name,
      trigger: rule.trigger,
      fromStatusIds: rule.fromStatusIds,
      targetStatusId: rule.targetStatusId,
      priorReply: rule.requirePriorPublicReply === null ? "ANY" : rule.requirePriorPublicReply ? "YES" : "NO",
      reopenWindowDays: rule.reopenWindowDays ? String(rule.reopenWindowDays) : "",
      priority: String(rule.priority),
      stopProcessing: rule.stopProcessing,
      isActive: rule.isActive
    });
    setShowRuleForm(true);
  }

  function toggleRuleSource(statusId: string) {
    setRuleDraft((current) => ({
      ...current,
      fromStatusIds: current.fromStatusIds.includes(statusId)
        ? current.fromStatusIds.filter((id) => id !== statusId)
        : [...current.fromStatusIds, statusId]
    }));
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    setBusy("RULE");
    setError(null);
    setNotice(null);
    try {
      await apiFetch(editingRuleId ? `/ticket-workflow/rules/${editingRuleId}` : "/ticket-workflow/rules", {
        method: editingRuleId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: ruleDraft.name,
          trigger: ruleDraft.trigger,
          fromStatusIds: ruleDraft.fromStatusIds,
          targetStatusId: ruleDraft.targetStatusId,
          requirePriorPublicReply: ruleDraft.priorReply === "ANY" ? null : ruleDraft.priorReply === "YES",
          reopenWindowDays: ruleDraft.reopenWindowDays ? Number(ruleDraft.reopenWindowDays) : null,
          priority: Number(ruleDraft.priority || 100),
          stopProcessing: ruleDraft.stopProcessing,
          isActive: ruleDraft.isActive
        })
      });
      setNotice(editingRuleId ? "Automation rule updated." : "Automation rule created.");
      resetRuleForm();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save automation rule.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRule(rule: TicketWorkflowRule) {
    if (!window.confirm(`Delete automation rule ${rule.name}?`)) return;
    setBusy(rule.id);
    setError(null);
    try {
      await apiFetch(`/ticket-workflow/rules/${rule.id}`, { method: "DELETE" });
      setNotice("Automation rule deleted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete automation rule.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRule(rule: TicketWorkflowRule) {
    setBusy(rule.id);
    setError(null);
    try {
      await apiFetch(`/ticket-workflow/rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !rule.isActive })
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update automation rule.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel ticket-workflow-settings">
      <div className="section-heading">
        <div>
          <h2>Ticket Workflow</h2>
          <p className="muted">Manage visible ticket statuses and safe event-driven status automation.</p>
        </div>
        <button className="button secondary compact-button" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <div className="settings-subtabs" role="tablist" aria-label="Ticket workflow configuration">
        <button type="button" className={tab === "STATUSES" ? "active" : ""} onClick={() => setTab("STATUSES")} role="tab" aria-selected={tab === "STATUSES"}><Check size={14} /> Statuses</button>
        <button type="button" className={tab === "RULES" ? "active" : ""} onClick={() => setTab("RULES")} role="tab" aria-selected={tab === "RULES"}><Workflow size={14} /> Automation Rules</button>
        <button type="button" className={tab === "HISTORY" ? "active" : ""} onClick={() => setTab("HISTORY")} role="tab" aria-selected={tab === "HISTORY"}><History size={14} /> History</button>
      </div>

      {tab === "STATUSES" ? (
        <div className="ticket-workflow-section">
          <div className="ticket-workflow-toolbar">
            <div><strong>{activeStatuses.length} active statuses</strong><span>Labels and colors are configurable; operational behavior remains stable.</span></div>
            <button className="button compact-button" type="button" onClick={() => { resetStatusForm(); setShowStatusForm(true); }}><Plus size={15} /> Add Status</button>
          </div>
          {showStatusForm ? (
            <form className="ticket-workflow-form" onSubmit={saveStatus}>
              <div className="ticket-workflow-form-heading"><strong>{editingStatusId ? "Edit Status" : "New Status"}</strong><button className="icon-button" type="button" onClick={resetStatusForm} aria-label="Close status form"><X size={15} /></button></div>
              <div className="ticket-workflow-form-grid">
                <label><span>Name</span><input className="input" required maxLength={80} value={statusDraft.name} onChange={(event) => setStatusDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label><span>Operational behavior</span><select className="input" value={statusDraft.systemStatus} onChange={(event) => setStatusDraft((current) => ({ ...current, systemStatus: event.target.value }))} disabled={Boolean(editingStatusId)}>{SYSTEM_STATUS_OPTIONS.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
                <label><span>Color</span><div className="ticket-status-color-control"><input type="color" value={statusDraft.color} onChange={(event) => setStatusDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))} /><input className="input" pattern="#[0-9A-Fa-f]{6}" value={statusDraft.color} onChange={(event) => setStatusDraft((current) => ({ ...current, color: event.target.value }))} /></div></label>
                <label><span>Display order</span><input className="input" type="number" min={0} value={statusDraft.sortOrder} onChange={(event) => setStatusDraft((current) => ({ ...current, sortOrder: event.target.value }))} /></label>
                <label className="ticket-workflow-wide"><span>Description</span><textarea className="input" maxLength={500} value={statusDraft.description} onChange={(event) => setStatusDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              </div>
              <label className="checkbox-row"><input type="checkbox" checked={statusDraft.isDefault} onChange={(event) => setStatusDraft((current) => ({ ...current, isDefault: event.target.checked }))} /> Default for newly created tickets</label>
              <div className="form-actions"><button className="button" type="submit" disabled={busy === "STATUS"}><Save size={15} /> {editingStatusId ? "Save Status" : "Create Status"}</button><button className="button secondary" type="button" onClick={resetStatusForm}>Cancel</button></div>
            </form>
          ) : null}
          <div className="table-scroll">
            <table className="tickets-table ticket-status-table">
              <thead><tr><th>Status</th><th>Behavior</th><th>Usage</th><th>Order</th><th>State</th><th>Actions</th></tr></thead>
              <tbody>
                {statuses.map((status) => (
                  <tr key={status.id} className={status.isActive ? "" : "ticket-workflow-inactive"}>
                    <td><div className="ticket-status-name"><span className="ticket-status-swatch" style={{ backgroundColor: status.color }} /><div><strong>{status.name}</strong><small>{status.key}{status.isDefault ? " · Default" : ""}{status.isProtected ? " · Protected" : ""}</small></div></div></td>
                    <td><strong>{label(status.category)}</strong><small>{label(status.systemStatus)}</small></td>
                    <td><strong>{status._count.tickets}</strong><small>{status._count.rulesAsTarget} target rules</small></td>
                    <td>{status.sortOrder}</td>
                    <td><span className={`status-pill ${status.isActive ? "success" : "muted-pill"}`}>{status.isActive ? "Active" : "Archived"}</span></td>
                    <td><div className="form-actions">
                      <button className="button secondary icon-button" type="button" onClick={() => editStatus(status)} title="Edit status" aria-label={`Edit ${status.name}`}><Pencil size={14} /></button>
                      {status.isActive ? <button className="button secondary icon-button" type="button" onClick={() => void removeStatus(status)} disabled={status.isProtected || busy === status.id} title={status._count.tickets || status._count.rulesAsTarget ? "Archive status" : "Delete status"} aria-label={`Remove ${status.name}`}>{status._count.tickets || status._count.rulesAsTarget ? <Archive size={14} /> : <Trash2 size={14} />}</button> : <button className="button secondary icon-button" type="button" onClick={() => void restoreStatus(status)} disabled={busy === status.id} title="Restore status" aria-label={`Restore ${status.name}`}><RotateCcw size={14} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "RULES" ? (
        <div className="ticket-workflow-section">
          <div className="ticket-workflow-toolbar">
            <div><strong>{rules.filter((rule) => rule.isActive).length} active rules</strong><span>Rules run by priority and cannot execute custom code.</span></div>
            <button className="button compact-button" type="button" onClick={() => { resetRuleForm(); setRuleDraft((current) => ({ ...current, targetStatusId: activeStatuses[0]?.id ?? "" })); setShowRuleForm(true); }}><Plus size={15} /> Add Rule</button>
          </div>
          {showRuleForm ? (
            <form className="ticket-workflow-form" onSubmit={saveRule}>
              <div className="ticket-workflow-form-heading"><strong>{editingRuleId ? "Edit Automation Rule" : "New Automation Rule"}</strong><button className="icon-button" type="button" onClick={resetRuleForm} aria-label="Close rule form"><X size={15} /></button></div>
              <div className="ticket-workflow-form-grid">
                <label><span>Name</span><input className="input" required maxLength={120} value={ruleDraft.name} onChange={(event) => setRuleDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label><span>When</span><select className="input" value={ruleDraft.trigger} onChange={(event) => setRuleDraft((current) => ({ ...current, trigger: event.target.value }))}>{TRIGGERS.map((trigger) => <option value={trigger} key={trigger}>{label(trigger)}</option>)}</select></label>
                <label><span>Set status to</span><select className="input" required value={ruleDraft.targetStatusId} onChange={(event) => setRuleDraft((current) => ({ ...current, targetStatusId: event.target.value }))}><option value="">Select status</option>{activeStatuses.filter((status) => status.systemStatus !== "MERGED").map((status) => <option value={status.id} key={status.id}>{status.name}</option>)}</select></label>
                <label><span>Prior public reply</span><select className="input" value={ruleDraft.priorReply} onChange={(event) => setRuleDraft((current) => ({ ...current, priorReply: event.target.value }))}><option value="ANY">Any</option><option value="YES">Required</option><option value="NO">Must not exist</option></select></label>
                <label><span>Reopen window (days)</span><input className="input" type="number" min={1} max={3650} placeholder="No limit" value={ruleDraft.reopenWindowDays} onChange={(event) => setRuleDraft((current) => ({ ...current, reopenWindowDays: event.target.value }))} /></label>
                <label><span>Priority</span><input className="input" type="number" min={0} max={10000} value={ruleDraft.priority} onChange={(event) => setRuleDraft((current) => ({ ...current, priority: event.target.value }))} /></label>
                <fieldset className="ticket-workflow-wide ticket-workflow-source-statuses"><legend>Only from these statuses</legend><span>Leave every option clear to match any current status.</span><div>{activeStatuses.map((status) => <label className="checkbox-row" key={status.id}><input type="checkbox" checked={ruleDraft.fromStatusIds.includes(status.id)} onChange={() => toggleRuleSource(status.id)} /><span className="ticket-status-swatch" style={{ backgroundColor: status.color }} />{status.name}</label>)}</div></fieldset>
              </div>
              <div className="ticket-workflow-rule-flags"><label className="checkbox-row"><input type="checkbox" checked={ruleDraft.stopProcessing} onChange={(event) => setRuleDraft((current) => ({ ...current, stopProcessing: event.target.checked }))} /> Stop after this rule matches</label><label className="checkbox-row"><input type="checkbox" checked={ruleDraft.isActive} onChange={(event) => setRuleDraft((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label></div>
              <div className="form-actions"><button className="button" type="submit" disabled={busy === "RULE"}><Save size={15} /> {editingRuleId ? "Save Rule" : "Create Rule"}</button><button className="button secondary" type="button" onClick={resetRuleForm}>Cancel</button></div>
            </form>
          ) : null}
          <div className="table-scroll">
            <table className="tickets-table ticket-workflow-rule-table">
              <thead><tr><th>Rule</th><th>Trigger</th><th>From</th><th>Target</th><th>Priority</th><th>State</th><th>Actions</th></tr></thead>
              <tbody>
                {rules.length === 0 ? <tr><td colSpan={7}>No automation rules configured.</td></tr> : null}
                {rules.map((rule) => (
                  <tr key={rule.id} className={rule.isActive ? "" : "ticket-workflow-inactive"}>
                    <td><strong>{rule.name}</strong><small>{rule.stopProcessing ? "Stops additional rules" : "Continues processing"}{rule.reopenWindowDays ? ` · ${rule.reopenWindowDays}-day window` : ""}</small></td>
                    <td>{label(rule.trigger)}</td>
                    <td>{rule.fromStatusIds.length ? `${rule.fromStatusIds.length} selected` : "Any status"}</td>
                    <td><span className="ticket-workflow-target"><span className="ticket-status-swatch" style={{ backgroundColor: rule.targetStatus.color }} />{rule.targetStatus.name}</span></td>
                    <td>{rule.priority}</td>
                    <td><button className={`status-pill ticket-workflow-toggle ${rule.isActive ? "success" : "muted-pill"}`} type="button" onClick={() => void toggleRule(rule)} disabled={busy === rule.id}>{rule.isActive ? "Active" : "Disabled"}</button></td>
                    <td><div className="form-actions"><button className="button secondary icon-button" type="button" onClick={() => editRule(rule)} title="Edit rule" aria-label={`Edit ${rule.name}`}><Pencil size={14} /></button><button className="button secondary icon-button" type="button" onClick={() => void deleteRule(rule)} disabled={busy === rule.id} title="Delete rule" aria-label={`Delete ${rule.name}`}><Trash2 size={14} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "HISTORY" ? (
        <div className="ticket-workflow-section">
          <div className="ticket-workflow-toolbar"><div><strong>Recent workflow changes</strong><span>Administrative changes and automated ticket transitions are retained in the audit log.</span></div></div>
          <div className="table-scroll">
            <table className="tickets-table">
              <thead><tr><th>Date</th><th>Action</th><th>User</th><th>Details</th></tr></thead>
              <tbody>
                {historyItems.length === 0 ? <tr><td colSpan={4}>No ticket workflow history yet.</td></tr> : null}
                {historyItems.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{readableAction(item.action)}</td><td>{item.user ? `${item.user.firstName} ${item.user.lastName}` : "System"}</td><td><small>{item.metadata ? Object.entries(item.metadata).slice(0, 3).map(([key, value]) => `${label(key)}: ${String(value)}`).join(" · ") : "No additional details"}</small></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
