import type { CSSProperties } from "react";

export interface TicketStatusDefinition {
  id: string;
  key: string;
  name: string;
  description: string | null;
  systemStatus: string;
  category: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isProtected: boolean;
  isActive: boolean;
}

export interface TicketStatusReference {
  status: string;
  statusDefinitionId?: string | null;
  statusDefinition?: TicketStatusDefinition | null;
}

export function ticketStatusDefinition(ticket: TicketStatusReference, catalog: TicketStatusDefinition[]) {
  return ticket.statusDefinition
    ?? catalog.find((status) => status.id === ticket.statusDefinitionId)
    ?? catalog.find((status) => status.key === ticket.status.toLowerCase())
    ?? catalog.find((status) => status.systemStatus === ticket.status)
    ?? null;
}

export function ticketStatusName(ticket: TicketStatusReference, catalog: TicketStatusDefinition[]) {
  const definition = ticketStatusDefinition(ticket, catalog);
  return definition?.name ?? humanize(ticket.status);
}

export function ticketStatusStyle(ticket: TicketStatusReference, catalog: TicketStatusDefinition[]): CSSProperties {
  const definition = ticketStatusDefinition(ticket, catalog);
  if (!definition) return {};
  const color = definition.color;
  return {
    color,
    borderColor: `${color}55`,
    backgroundColor: `${color}18`
  };
}

export function humanize(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
