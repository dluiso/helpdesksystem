import type { Metadata } from "next";
import { PublicSupportTicketRequest } from "@/components/support-portal/PublicSupportTicketRequest";

export const metadata: Metadata = {
  title: "Avidity One - Support Portal"
};

export default function PublicSupportRequestPage() {
  return <PublicSupportTicketRequest />;
}
