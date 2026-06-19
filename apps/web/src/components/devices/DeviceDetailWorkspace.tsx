"use client";

import { ArrowLeft, ExternalLink, HardDrive, Laptop, Monitor, RefreshCcw, Server, Smartphone, TerminalSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface DeviceRecord {
  id: string;
  name: string;
  hostname: string | null;
  deviceGroupId: string | null;
  type: string;
  operatingSystem: string | null;
  osVersion: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  primaryUser: string | null;
  status: string;
  remoteAccessProvider: string | null;
  remoteAccessId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; shortName: string | null };
  actionUrls: {
    systemInfoUrl: string | null;
    controlUrl: string | null;
  };
  remoteAccessProfile: {
    id: string;
    provider: string;
    remoteIdentifier: string;
    connectionUrl: string | null;
    lastConnectionAttemptAt: string | null;
  } | null;
}

interface DeviceDetailResponse {
  device: DeviceRecord;
  remoteAccess: {
    enabled: boolean;
    providerName: string;
  };
}

export function DeviceDetailWorkspace({ deviceId }: { deviceId: string }) {
  const [data, setData] = useState<DeviceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadDevice() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<DeviceDetailResponse>(`/devices/${deviceId}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load device.");
    } finally {
      setLoading(false);
    }
  }

  async function openRemote(mode: "control" | "system") {
    const device = data?.device;
    if (!device) return;
    const url = mode === "control" ? device.actionUrls.controlUrl : device.actionUrls.systemInfoUrl;
    if (!url) {
      setError(mode === "control" ? "This device does not have a remote control URL configured." : "This device does not have a system info URL configured.");
      return;
    }

    setBusy(mode);
    setError(null);
    try {
      if (mode === "control") {
        const response = await apiFetch<{ connectionUrl: string | null }>(`/devices/${device.id}/remote-access/connection-attempts`, { method: "POST" });
        window.open(response.connectionUrl ?? url, "_blank", "noopener,noreferrer");
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open remote access.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadDevice();
  }, [deviceId]);

  const device = data?.device;
  const DeviceIcon = device ? getDeviceIcon(device) : Monitor;
  const OsIcon = getOsIcon(device?.operatingSystem);

  return (
    <>
      <div className="compact-page-header">
        <div>
          <Link className="button secondary compact" href="/devices">
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to Devices</span>
          </Link>
          <h1>{device?.name ?? "Device"}</h1>
          <p className="muted">{device ? `${device.client.name} - ${device.deviceGroupId ?? "No site"}` : "Loading device detail..."}</p>
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={loadDevice} disabled={loading}>
            <RefreshCcw size={16} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {loading && !device ? (
        <section className="panel">
          <p className="muted">Loading device detail...</p>
        </section>
      ) : null}

      {device ? (
        <section className="panel device-detail-panel">
          <div className="device-detail-hero">
            <span className="device-type-icon large"><DeviceIcon size={28} aria-hidden="true" /></span>
            <div>
              <span className={`status-pill ${device.status === "ACTIVE" ? "success" : "muted"}`}>{device.status}</span>
              <h2>{device.name}</h2>
              <p className="muted">{device.hostname ?? "No hostname"} - {device.remoteAccessProvider ?? "Manual device"}</p>
            </div>
            <div className="device-detail-actions">
              <button className="button primary" type="button" onClick={() => openRemote("control")} disabled={busy === "control" || !device.actionUrls.controlUrl}>
                <ExternalLink size={16} aria-hidden="true" />
                <span>{busy === "control" ? "Opening..." : "Connect"}</span>
              </button>
              <button className="button secondary" type="button" onClick={() => openRemote("system")} disabled={busy === "system" || !device.actionUrls.systemInfoUrl}>
                <HardDrive size={16} aria-hidden="true" />
                <span>SysInfo</span>
              </button>
            </div>
          </div>

          <div className="device-detail-grid">
            <DetailItem label="Client" value={device.client.name} />
            <DetailItem label="Site" value={device.deviceGroupId ?? "-"} />
            <DetailItem label="Device type" value={formatEnum(device.type)} />
            <DetailItem label="Operating system" value={device.operatingSystem ?? "-"} icon={<OsIcon size={16} aria-hidden="true" />} />
            <DetailItem label="OS version" value={device.osVersion ?? "-"} />
            <DetailItem label="Primary user" value={device.primaryUser ?? "-"} />
            <DetailItem label="Serial number" value={device.serialNumber ?? "-"} />
            <DetailItem label="Asset tag" value={device.assetTag ?? "-"} />
            <DetailItem label="Last seen" value={formatDate(device.lastSeenAt)} />
            <DetailItem label="Last remote action" value={formatDate(device.remoteAccessProfile?.lastConnectionAttemptAt ?? null)} />
            <DetailItem label="Remote ID" value={device.remoteAccessId ?? device.remoteAccessProfile?.remoteIdentifier ?? "-"} />
            <DetailItem label="Updated" value={formatDate(device.updatedAt)} />
          </div>
        </section>
      ) : null}
    </>
  );
}

function DetailItem({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="device-detail-item">
      <span>{label}</span>
      <strong>{icon}{value}</strong>
    </div>
  );
}

function getDeviceIcon(device: DeviceRecord) {
  const source = `${device.type} ${device.name} ${device.operatingSystem ?? ""}`.toLowerCase();
  if (source.includes("server")) return Server;
  if (source.includes("laptop") || source.includes("notebook")) return Laptop;
  if (source.includes("tablet") || source.includes("ios") || source.includes("android")) return Smartphone;
  return Monitor;
}

function getOsIcon(os?: string | null) {
  const source = (os ?? "").toLowerCase();
  if (source.includes("linux") || source.includes("ubuntu") || source.includes("debian")) return TerminalSquare;
  if (source.includes("server")) return Server;
  return Monitor;
}

function formatEnum(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}
