import { AppShell } from "@/components/layout/AppShell";
import { TicketsList } from "@/components/tickets/TicketsList";

export default function TicketsPage() {
  return (
    <AppShell>
      <TicketsList />
    </AppShell>
  );
}
