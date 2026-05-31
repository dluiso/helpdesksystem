import { AppShell } from "@/components/layout/AppShell";

export default function DevicesPage() {
  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Devices</h1>
          <p className="muted">Inventory records and external remote access identifiers will be managed here.</p>
        </div>
      </div>
      <section className="panel">
        <h2>Device Inventory</h2>
        <p className="muted">No devices have been added yet.</p>
      </section>
    </AppShell>
  );
}
