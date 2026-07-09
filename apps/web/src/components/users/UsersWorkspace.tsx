"use client";

import { Edit3, KeyRound, RefreshCcw, Trash2, UserPlus, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface RoleSummary {
  id: string;
  name: string;
}

interface Permission {
  id: string;
  name: string;
  description: string | null;
}

interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  mfaEnabled: boolean;
  groups: Array<{
    group: {
      id: string;
      name: string;
      roles: Array<{ role: RoleSummary }>;
    };
  }>;
}

interface GroupRecord {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  users: Array<{ userId: string }>;
  roles: Array<{
    role: RoleSummary & {
      permissions: Array<{ permission: Permission }>;
    };
  }>;
}

interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  groups: Array<{ groupId: string }>;
  permissions: Array<{ permission: Permission }>;
}

const emptyUserForm = {
  id: "",
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  isActive: true,
  forcePasswordChange: true,
  groupIds: [] as string[]
};

const emptyGroupForm = {
  id: "",
  name: "",
  description: "",
  roleIds: [] as string[]
};

const emptyRoleForm = {
  id: "",
  name: "",
  description: "",
  permissionIds: [] as string[]
};

type ActiveTab = "users" | "groups" | "roles";

const permissionScopeLabels: Record<string, string> = {
  ai_assistant: "AI Assistant",
  audit_logs: "Audit Logs",
  auto_replies: "Auto Replies",
  client_domains: "Client Domains",
  clients: "Clients",
  contacts: "Contacts",
  devices: "Devices",
  event_services: "Event Services",
  external_specialists: "External Specialists",
  groups: "Access Groups",
  knowledge_base: "Knowledge Base",
  mailboxes: "Mailboxes",
  maintenance: "Maintenance",
  permissions: "Permission Catalog",
  remote_access: "Remote Access",
  reports: "Reports",
  roles: "Roles",
  signatures: "Signatures",
  spam: "Spam Management",
  system_settings: "System Settings",
  ticket_attachments: "Ticket Attachments",
  ticket_messages: "Ticket Messages",
  tickets: "Tickets",
  users: "Users"
};

const permissionScopeOrder = [
  "tickets",
  "ticket_messages",
  "ticket_attachments",
  "event_services",
  "external_specialists",
  "clients",
  "contacts",
  "client_domains",
  "devices",
  "remote_access",
  "knowledge_base",
  "reports",
  "ai_assistant",
  "mailboxes",
  "auto_replies",
  "spam",
  "maintenance",
  "users",
  "groups",
  "roles",
  "permissions",
  "system_settings",
  "audit_logs",
  "signatures"
];

const permissionActionOrder = ["view", "create", "update", "assign", "reply", "close", "reopen", "merge", "upload", "download", "publish", "send", "export", "manage", "configure", "connect", "delete"];
const sensitivePermissionScopes = new Set(["users", "groups", "roles", "permissions", "system_settings", "audit_logs", "mailboxes"]);

function permissionScopeLabel(scope: string) {
  return permissionScopeLabels[scope] ?? scope.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function permissionActionRank(permissionName: string) {
  const action = permissionName.split(".")[1] ?? "";
  const index = permissionActionOrder.indexOf(action);
  return index === -1 ? permissionActionOrder.length : index;
}

export function UsersWorkspace() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);

  const permissionGroups = useMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const permission of permissions) {
      const [scope] = permission.name.split(".");
      grouped.set(scope, [...(grouped.get(scope) ?? []), permission]);
    }
    return [...grouped.entries()]
      .map(([scope, scopePermissions]) => ({
        scope,
        label: permissionScopeLabel(scope),
        isSensitive: sensitivePermissionScopes.has(scope),
        permissions: [...scopePermissions].sort((a, b) => permissionActionRank(a.name) - permissionActionRank(b.name) || a.name.localeCompare(b.name))
      }))
      .sort((a, b) => {
        const scopeA = permissionScopeOrder.indexOf(a.scope);
        const scopeB = permissionScopeOrder.indexOf(b.scope);
        const rankA = scopeA === -1 ? permissionScopeOrder.length : scopeA;
        const rankB = scopeB === -1 ? permissionScopeOrder.length : scopeB;
        return rankA - rankB || a.label.localeCompare(b.label);
      });
  }, [permissions]);
  const permissionIds = useMemo(() => new Set(permissions.map((permission) => permission.id)), [permissions]);
  const permissionIdByName = useMemo(() => new Map(permissions.map((permission) => [permission.name, permission.id])), [permissions]);
  const selectedRolePermissionCount = normalizeRolePermissionIds(roleForm.permissionIds).permissionIds.length;

  async function loadAccessData() {
    setLoading(true);
    setError(null);
    try {
      const [userData, groupData, roleData, permissionData] = await Promise.all([
        apiFetch<UserRecord[]>("/users"),
        apiFetch<GroupRecord[]>("/groups"),
        apiFetch<RoleRecord[]>("/roles"),
        apiFetch<Permission[]>("/permissions")
      ]);
      setUsers(userData);
      setGroups(groupData);
      setRoles(roleData);
      setPermissions(permissionData);
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to load user access data.${detail ? ` ${detail}` : ""}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccessData();
  }, []);

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const isEditing = Boolean(userForm.id);
      await apiFetch(isEditing ? `/users/${userForm.id}` : "/users", {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify({
          email: userForm.email,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          password: userForm.password || undefined,
          isActive: userForm.isActive,
          forcePasswordChange: userForm.forcePasswordChange,
          groupIds: userForm.groupIds
        })
      });
      setNotice(isEditing ? "User updated." : "User created.");
      closeUserForm();
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to save user.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: UserRecord) {
    if (!window.confirm(`Delete ${user.firstName} ${user.lastName}? Existing ticket history will remain.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      setNotice("User deleted.");
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to delete user.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function resetUserMfa(user: UserRecord) {
    if (!window.confirm(`Reset two-factor authentication for ${user.firstName} ${user.lastName}? The user will need to set it up again.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/users/${user.id}/reset-mfa`, { method: "POST" });
      setNotice("Two-factor authentication reset.");
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to reset MFA.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const isEditing = Boolean(groupForm.id);
      await apiFetch(isEditing ? `/groups/${groupForm.id}` : "/groups", {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify({
          name: groupForm.name,
          description: groupForm.description || null,
          roleIds: groupForm.roleIds
        })
      });
      setNotice(isEditing ? "Group updated." : "Group created.");
      closeGroupForm();
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to save group.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(group: GroupRecord) {
    if (!window.confirm(`Delete group ${group.name}? Assigned tickets and rules will be unassigned from this group.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/groups/${group.id}`, { method: "DELETE" });
      setNotice("Group deleted.");
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to delete group.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const isEditing = Boolean(roleForm.id);
      const normalizedPermissionIds = normalizeRolePermissionIds(roleForm.permissionIds);
      if (normalizedPermissionIds.invalidValues.length > 0) {
        setRoleForm((current) => ({ ...current, permissionIds: normalizedPermissionIds.permissionIds }));
        setError("Unable to save role. One or more selected permissions are no longer valid. Review the selection and try again.");
        return;
      }
      await apiFetch(isEditing ? `/roles/${roleForm.id}` : "/roles", {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify({
          name: roleForm.name,
          description: roleForm.description || null,
          permissionIds: normalizedPermissionIds.permissionIds
        })
      });
      setNotice(isEditing ? "Role updated." : "Role created.");
      closeRoleForm();
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to save role.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: RoleRecord) {
    if (!window.confirm(`Delete role ${role.name}? Groups using this role will lose its permissions.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/roles/${role.id}`, { method: "DELETE" });
      setNotice("Role deleted.");
      await loadAccessData();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "";
      setError(`Unable to delete role.${detail ? ` ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  function editUser(user: UserRecord) {
    setUserForm({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: "",
      isActive: user.isActive,
      forcePasswordChange: user.forcePasswordChange,
      groupIds: user.groups.map((item) => item.group.id)
    });
    setShowUserForm(true);
    setActiveTab("users");
  }

  function editGroup(group: GroupRecord) {
    setGroupForm({
      id: group.id,
      name: group.name,
      description: group.description ?? "",
      roleIds: group.roles.map((item) => item.role.id)
    });
    setShowGroupForm(true);
    setActiveTab("groups");
  }

  function editRole(role: RoleRecord) {
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissionIds: role.permissions.map((item) => item.permission.id)
    });
    setShowRoleForm(true);
    setActiveTab("roles");
  }

  function closeUserForm() {
    setShowUserForm(false);
    setUserForm(emptyUserForm);
  }

  function closeGroupForm() {
    setShowGroupForm(false);
    setGroupForm(emptyGroupForm);
  }

  function closeRoleForm() {
    setShowRoleForm(false);
    setRoleForm(emptyRoleForm);
  }

  function toggleUserGroup(groupId: string, checked: boolean) {
    setUserForm((current) => ({ ...current, groupIds: checked ? [...new Set([...current.groupIds, groupId])] : current.groupIds.filter((id) => id !== groupId) }));
  }

  function toggleGroupRole(roleId: string, checked: boolean) {
    setGroupForm((current) => ({ ...current, roleIds: checked ? [...new Set([...current.roleIds, roleId])] : current.roleIds.filter((id) => id !== roleId) }));
  }

  function toggleRolePermission(permissionId: string, checked: boolean) {
    setRoleForm((current) => ({
      ...current,
      permissionIds: checked ? [...new Set([...current.permissionIds, permissionId])] : current.permissionIds.filter((id) => id !== permissionId)
    }));
  }

  function toggleRolePermissionScope(scopePermissionIds: string[], checked: boolean) {
    setRoleForm((current) => ({
      ...current,
      permissionIds: checked
        ? [...new Set([...current.permissionIds, ...scopePermissionIds])]
        : current.permissionIds.filter((id) => !scopePermissionIds.includes(id))
    }));
  }

  function openNewRoleForm() {
    setRoleForm(emptyRoleForm);
    setShowRoleForm(true);
    setActiveTab("roles");
  }

  function normalizeRolePermissionIds(values: string[]) {
    const nextIds: string[] = [];
    const invalidValues: string[] = [];
    for (const value of values) {
      if (permissionIds.has(value)) {
        nextIds.push(value);
        continue;
      }
      const permissionId = permissionIdByName.get(value);
      if (permissionId) {
        nextIds.push(permissionId);
        continue;
      }
      invalidValues.push(value);
    }
    return { permissionIds: [...new Set(nextIds)], invalidValues };
  }

  function userRoleNames(user: UserRecord) {
    return [...new Set(user.groups.flatMap((item) => item.group.roles.map((groupRole) => groupRole.role.name)))].join(", ") || "No roles";
  }

  return (
    <>
      <div className="compact-page-header">
        <div>
          <h1>Users</h1>
        </div>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={loadAccessData} disabled={loading || saving}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button className="button" type="button" onClick={() => setShowUserForm(true)}>
            <UserPlus size={16} aria-hidden="true" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="access-layout">
        <nav className="settings-nav" aria-label="Access management sections">
          <button className={activeTab === "users" ? "active" : ""} type="button" onClick={() => setActiveTab("users")}>
            Users
          </button>
          <button className={activeTab === "groups" ? "active" : ""} type="button" onClick={() => setActiveTab("groups")}>
            Groups
          </button>
          <button className={activeTab === "roles" ? "active" : ""} type="button" onClick={() => setActiveTab("roles")}>
            Roles & Permissions
          </button>
        </nav>

        <div className="settings-content">
          {activeTab === "users" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Staff Users</h2>
                  <p className="muted">Users can be assigned to groups used by ticket assignment, watchers, and permission checks.</p>
                </div>
                <span className="status-pill">{users.length} users</span>
              </div>

              {showUserForm ? (
                <form className="access-form" onSubmit={saveUser}>
                  <div className="section-heading compact-heading">
                    <h3>{userForm.id ? "Edit User" : "New User"}</h3>
                    <button className="button ghost" type="button" onClick={closeUserForm}>
                      <X size={16} aria-hidden="true" />
                      <span>Cancel</span>
                    </button>
                  </div>
                  <div className="client-form-grid">
                    <input className="input" placeholder="First name" value={userForm.firstName} onChange={(event) => setUserForm((current) => ({ ...current, firstName: event.target.value }))} required />
                    <input className="input" placeholder="Last name" value={userForm.lastName} onChange={(event) => setUserForm((current) => ({ ...current, lastName: event.target.value }))} required />
                    <input className="input" type="email" placeholder="Email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} required />
                    <input className="input" type="password" placeholder={userForm.id ? "New password, optional" : "Temporary password"} value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} required={!userForm.id} />
                    <label className="checkbox-row"><input type="checkbox" checked={userForm.isActive} onChange={(event) => setUserForm((current) => ({ ...current, isActive: event.target.checked }))} />Active</label>
                    <label className="checkbox-row"><input type="checkbox" checked={userForm.forcePasswordChange} onChange={(event) => setUserForm((current) => ({ ...current, forcePasswordChange: event.target.checked }))} />Force password change</label>
                  </div>
                  <div className="access-check-grid">
                    {groups.map((group) => (
                      <label className="checkbox-row" key={group.id}>
                        <input type="checkbox" checked={userForm.groupIds.includes(group.id)} onChange={(event) => toggleUserGroup(group.id, event.target.checked)} />
                        <span>{group.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className="button" type="submit" disabled={saving}>{userForm.id ? "Save User" : "Create User"}</button>
                </form>
              ) : null}

              <AccessTable>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Groups</th><th>Roles</th><th>Status</th><th>MFA</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={7}>Loading users...</td></tr> : null}
                  {!loading && users.length === 0 ? <tr><td colSpan={7}>No users created yet.</td></tr> : null}
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.firstName} {user.lastName}</strong></td>
                      <td>{user.email}</td>
                      <td>{user.groups.map((item) => item.group.name).join(", ") || "No groups"}</td>
                      <td>{userRoleNames(user)}</td>
                      <td><span className={`status-pill ${user.isActive ? "success" : "muted-pill"}`}>{user.isActive ? "Active" : "Inactive"}</span></td>
                      <td><span className={`status-pill ${user.mfaEnabled ? "success" : "muted-pill"}`}>{user.mfaEnabled ? "Enabled" : "Off"}</span></td>
                      <td>
                        <div className="form-actions">
                          <button className="icon-button" type="button" title="Reset MFA" aria-label="Reset MFA" onClick={() => resetUserMfa(user)} disabled={saving || !user.mfaEnabled}><KeyRound size={16} /></button>
                          <button className="icon-button" type="button" title="Edit user" aria-label="Edit user" onClick={() => editUser(user)}><Edit3 size={16} /></button>
                          <button className="icon-button danger-icon" type="button" title="Delete user" aria-label="Delete user" onClick={() => deleteUser(user)} disabled={saving}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AccessTable>
            </section>
          ) : null}

          {activeTab === "groups" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Groups</h2>
                  <p className="muted">Groups are used for access profiles and ticket assignment queues.</p>
                </div>
                <button className="button" type="button" onClick={() => setShowGroupForm(true)}>Add Group</button>
              </div>

              {showGroupForm ? (
                <form className="access-form" onSubmit={saveGroup}>
                  <div className="section-heading compact-heading">
                    <h3>{groupForm.id ? "Edit Group" : "New Group"}</h3>
                    <button className="button ghost" type="button" onClick={closeGroupForm}><X size={16} /><span>Cancel</span></button>
                  </div>
                  <div className="client-form-grid">
                    <input className="input" placeholder="Group name" value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} required />
                    <input className="input" placeholder="Description" value={groupForm.description} onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  <div className="access-check-grid">
                    {roles.map((role) => (
                      <label className="checkbox-row" key={role.id}>
                        <input type="checkbox" checked={groupForm.roleIds.includes(role.id)} onChange={(event) => toggleGroupRole(role.id, event.target.checked)} />
                        <span>{role.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className="button" type="submit" disabled={saving}>{groupForm.id ? "Save Group" : "Create Group"}</button>
                </form>
              ) : null}

              <AccessTable>
                <thead>
                  <tr><th>Name</th><th>Description</th><th>Roles</th><th>Users</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td><strong>{group.name}</strong>{group.isSystem ? <span className="muted">System group</span> : null}</td>
                      <td>{group.description ?? "No description"}</td>
                      <td>{group.roles.map((item) => item.role.name).join(", ") || "No roles"}</td>
                      <td>{group.users.length}</td>
                      <td>
                        <div className="form-actions">
                          <button className="icon-button" type="button" title="Edit group" aria-label="Edit group" onClick={() => editGroup(group)}><Edit3 size={16} /></button>
                          <button className="icon-button danger-icon" type="button" title="Delete group" aria-label="Delete group" onClick={() => deleteGroup(group)} disabled={saving || group.isSystem}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AccessTable>
            </section>
          ) : null}

          {activeTab === "roles" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Roles & Permissions</h2>
                  <p className="muted">Roles define permission bundles. Assign roles to groups to control module access.</p>
                </div>
                <button className="button" type="button" onClick={openNewRoleForm}>Add Role</button>
              </div>

              {showRoleForm ? (
                <form className="access-form" onSubmit={saveRole}>
                  <div className="section-heading compact-heading">
                    <h3>{roleForm.id ? "Edit Role" : "New Role"}</h3>
                    <button className="button ghost" type="button" onClick={closeRoleForm}><X size={16} /><span>Cancel</span></button>
                  </div>
                  <div className="client-form-grid">
                    <input className="input" placeholder="Role name" value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} required />
                    <input className="input" placeholder="Description" value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  <div className="permission-grid">
                    {permissionGroups.map((group) => {
                      const scopePermissionIds = group.permissions.map((permission) => permission.id);
                      const selectedCount = scopePermissionIds.filter((permissionId) => roleForm.permissionIds.includes(permissionId)).length;
                      const allSelected = selectedCount === scopePermissionIds.length && scopePermissionIds.length > 0;
                      const partiallySelected = selectedCount > 0 && !allSelected;
                      return (
                        <div className={`permission-group${group.isSensitive ? " sensitive" : ""}`} key={group.scope}>
                          <div className="permission-group-heading">
                            <div>
                              <strong>{group.label}</strong>
                              <small>{selectedCount}/{scopePermissionIds.length} selected{group.isSensitive ? " · Sensitive" : ""}</small>
                            </div>
                            <label className="checkbox-row permission-select-all">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(input) => {
                                  if (input) input.indeterminate = partiallySelected;
                                }}
                                onChange={(event) => toggleRolePermissionScope(scopePermissionIds, event.target.checked)}
                              />
                              <span>All</span>
                            </label>
                          </div>
                          {group.permissions.map((permission) => (
                            <label className="checkbox-row" key={permission.id} title={permission.description ?? permission.name}>
                              <input type="checkbox" checked={roleForm.permissionIds.includes(permission.id)} onChange={(event) => toggleRolePermission(permission.id, event.target.checked)} />
                              <span>{permission.name}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                    {permissions.length === 0 ? (
                      <p className="muted">No permissions are available. Refresh access data and try again.</p>
                    ) : null}
                  </div>
                  <div className="role-permission-summary">
                    <span>{selectedRolePermissionCount} permission{selectedRolePermissionCount === 1 ? "" : "s"} selected</span>
                    <span>Sensitive modules include users, groups, roles, settings, audit logs, and mailboxes.</span>
                  </div>
                  <button className="button" type="submit" disabled={saving}>{roleForm.id ? "Save Role" : "Create Role"}</button>
                </form>
              ) : null}

              <AccessTable>
                <thead>
                  <tr><th>Name</th><th>Description</th><th>Permissions</th><th>Groups</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td><strong>{role.name}</strong>{role.isSystem ? <span className="muted">System role</span> : null}</td>
                      <td>{role.description ?? "No description"}</td>
                      <td>{role.permissions.length}</td>
                      <td>{role.groups.length}</td>
                      <td>
                        <div className="form-actions">
                          <button className="icon-button" type="button" title="Edit role" aria-label="Edit role" onClick={() => editRole(role)}><Edit3 size={16} /></button>
                          <button className="icon-button danger-icon" type="button" title="Delete role" aria-label="Delete role" onClick={() => deleteRole(role)} disabled={saving || role.isSystem}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AccessTable>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}

function AccessTable({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll settings-section">
      <table className="table access-table">{children}</table>
    </div>
  );
}
