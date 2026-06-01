import { AppShell } from "@/components/layout/AppShell";
import { TicketDetailWorkspace } from "@/components/tickets/TicketDetailWorkspace";

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;

  return (
    <AppShell>
      <TicketDetailWorkspace ticketId={ticketId} />
    </AppShell>
  );
}
