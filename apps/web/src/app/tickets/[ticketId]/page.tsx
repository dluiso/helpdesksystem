import { AppShell } from "@/components/layout/AppShell";
import { TicketDetailWorkspace } from "@/components/tickets/TicketDetailWorkspace";

export default function TicketDetailPage({ params }: { params: { ticketId: string } }) {
  return (
    <AppShell>
      <TicketDetailWorkspace ticketId={params.ticketId} />
    </AppShell>
  );
}
