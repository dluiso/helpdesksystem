import { EventServicesWorkspace } from "@/components/event-services/EventServicesWorkspace";
import { AppShell } from "@/components/layout/AppShell";

export default async function EventServiceDetailPage({ params }: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await params;

  return (
    <AppShell>
      <EventServicesWorkspace detailTrackingNumber={decodeURIComponent(trackingNumber)} />
    </AppShell>
  );
}
