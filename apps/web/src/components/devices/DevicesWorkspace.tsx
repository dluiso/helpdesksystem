"use client";

import { ExternalLink, Monitor, RefreshCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

interface DeviceRecord {
  id: string;
  name: string;
  hostname: string | null;
  deviceGroupId: string | null;
  type: string;
  operatingSystem: string | null;
  osVersion: string | null;
  primaryUser: string | null;
  status: string;
  remoteAccessProvider: string | null;
  remoteAccessId: string | null;
  lastSeenAt: string | null;
  client: { id: string; name: string; shortName: string | null };
  remoteAccessProfile: {
    id: string;
    provider: string;
    remoteIdentifier: string;
    connectionUrl: string | null;
    lastConnectionAttemptAt: string | null;
  } | null;
}

interface DevicesResponse {
  devices: DeviceRecord[];
  clients: Array<{ id: string; name: string }>;
  remoteAccess: {
    enabled: boolean;
    providerName: string;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncMessage: string | null;
  };
}

export function DevicesWorkspace() {
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (clientId) params.set("clientId", clientId);
    if (status) params.set("status", status);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [clientId, search, status]);

  async function loadDevices() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<DevicesResponse>(`/devices${query}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load devices.");
    } finally {
      setLoading(false);
    }
  }

  async function syncDevices() {
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch<{ total: number; created: number; updated: number }>("/devices/rmm-sync", { method: "POST" });
      setNotice(`Synced ${response.total} device${response.total === 1 ? "" : "s"} (${response.created} created, ${response.updated} updated).`);
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync RMM devices.");
    } finally {
      setBusy(null);
    }
  }

  async function connectToDevice(device: DeviceRecord) {
    const connectionUrl = device.remoteAccessProfile?.connectionUrl;
    if (!connectionUrl) {
      setError("This device does not have a remote access URL configured.");
      return;
    }
    setBusy(device.id);
    setError(null);
    try {
      await apiFetch(`/devices/${device.id}/remote-access/connection-attempts`, { method: "POST" });
      window.open(connectionUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open remote access.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, [query]);

  return (
    <>
      <div className="compact-page-header">
        <div>
          <h1>Devices</h1>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={loadDevices} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button className="button primary" type="button" onClick={syncDevices} disabled={Boolean(busy) || !data?.remoteAccess.enabled}>
            <Monitor size={16} aria-hidden="true" />
            <span>{busy === "sync" ? "Syncing..." : "Sync RMM"}</span>
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}

      <section className="panel device-toolbar-panel">
        <div className="device-search-field">
          <Search size={16} aria-hidden="true" />
          <input className="input" placeholder="Search device, hostname, client, OS, or user" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className="input" value={clientId} onChange={(event) => setClientId(event.target.value)}>
          <option value="">All clients</option>
          {data?.clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="RETIRED">Retired</option>
        </select>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Device Inventory</h2>
            <p className="muted">
              {loading ? "Loading devices..." : `${data?.devices.length ?? 0} device${data?.devices.length === 1 ? "" : "s"} in this view.`}
            </p>
          </div>
          <span className={`status-pill ${data?.remoteAccess.enabled ? "success" : "muted"}`}>
            {data?.remoteAccess.enabled ? data.remoteAccess.providerName : "RMM disabled"}
          </span>
        </div>

        {data?.remoteAccess.lastSyncMessage ? (
          <div className="device-sync-note">
            <strong>Last sync:</strong> {data.remoteAccess.lastSyncMessage}
          </div>
        ) : null}

        {!loading && data?.devices.length === 0 ? (
          <div className="empty-state">
            <h3>No devices found</h3>
            <p className="muted">Configure RMM Integration in Settings, then run a manual sync to populate the inventory.</p>
          </div>
        ) : null}

        {data?.devices.length ? (
          <div className="device-table-wrapper">
            <table className="device-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Client / Site</th>
                  <th>OS</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>Remote</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <strong>{device.name}</strong>
                      <span>{device.hostname ?? device.remoteAccessId ?? device.type}</span>
                    </td>
                    <td>
                      <strong>{device.client.name}</strong>
                      <span>{device.deviceGroupId ?? "No site"}</span>
                    </td>
                    <td>
                      <strong>{device.operatingSystem ?? "Unknown"}</strong>
                      <span>{device.osVersion ?? device.primaryUser ?? ""}</span>
                    </td>
                    <td><span className={`status-pill ${device.status === "ACTIVE" ? "success" : "muted"}`}>{device.status}</span></td>
                    <td>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "-"}</td>
                    <td>{device.remoteAccessProvider ?? "-"}</td>
                    <td>
                      <button className="button secondary compact" type="button" onClick={() => connectToDevice(device)} disabled={busy === device.id || !device.remoteAccessProfile?.connectionUrl}>
                        <ExternalLink size={14} aria-hidden="true" />
                        <span>Connect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
