import { DeviceDetailWorkspace } from "@/components/devices/DeviceDetailWorkspace";
import { AppShell } from "@/components/layout/AppShell";

export default async function DeviceDetailPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  return (
    <AppShell>
      <DeviceDetailWorkspace deviceId={deviceId} />
    </AppShell>
  );
}
