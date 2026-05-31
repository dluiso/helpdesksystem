"use client";

import { dashboardNavigation } from "@avidity/ui";
import {
  BarChart3,
  BookOpen,
  Building2,
  Gauge,
  HardDrive,
  LifeBuoy,
  Settings,
  Ticket,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { apiFetch } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

const iconMap = {
  Dashboard: Gauge,
  Tickets: Ticket,
  Users: UsersRound,
  Clients: Building2,
  Devices: HardDrive,
  Reports: BarChart3,
  "Knowledge Base": BookOpen,
  Settings
};

interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  permissions: string[];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const branding = useBranding();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ user: CurrentUser }>("/auth/me")
      .then((response) => {
        if (mounted) {
          setUser(response.user);
        }
      })
      .catch(() => {
        window.location.assign("/login");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const userPermissions = useMemo(() => new Set(user?.permissions ?? []), [user?.permissions]);
  const navigation = useMemo(
    () => dashboardNavigation.filter((item) => !item.permission || userPermissions.has(item.permission)),
    [userPermissions]
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">{branding.applicationName.slice(0, 1)}</span>
          <span className="brand-name">{branding.applicationName}</span>
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = iconMap[item.label as keyof typeof iconMap] ?? LifeBuoy;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={`nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <strong>{branding.companyName}</strong>
            <div className="muted">{branding.supportEmail}</div>
          </div>
          <div className="topbar-actions">
            <button className="button secondary" type="button">
              <LifeBuoy size={16} aria-hidden="true" />
              <span>Support</span>
            </button>
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
