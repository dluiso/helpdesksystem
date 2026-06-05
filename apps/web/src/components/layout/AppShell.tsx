"use client";

import { dashboardNavigation } from "@avidity/ui";
import {
  BarChart3,
  BookOpen,
  Building2,
  Gauge,
  HardDrive,
  LifeBuoy,
  Menu,
  Settings,
  UserRound,
  Ticket,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { apiFetch } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

const iconMap = {
  Dashboard: Gauge,
  Tickets: Ticket,
  Users: UsersRound,
  Clients: Building2,
  Devices: HardDrive,
  Reports: BarChart3,
  "Knowledge Base": BookOpen,
  Profile: UserRound,
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const primaryMobileNavigation = useMemo(
    () => navigation.filter((item) => ["Dashboard", "Tickets", "Clients", "Settings"].includes(item.label)).slice(0, 4),
    [navigation]
  );

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="shell">
      {mobileNavOpen ? <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
      <aside className={`sidebar${mobileNavOpen ? " mobile-open" : ""}`}>
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
          <div className="topbar-brand">
            <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
              <Menu size={20} aria-hidden="true" />
            </button>
            <div>
              <strong>{branding.companyName}</strong>
              <div className="muted">{branding.supportEmail}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="button secondary" type="button">
              <LifeBuoy size={16} aria-hidden="true" />
              <span>Support</span>
            </button>
            <ThemeToggle />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="content">{children}</main>
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          {primaryMobileNavigation.map((item) => {
            const Icon = iconMap[item.label as keyof typeof iconMap] ?? LifeBuoy;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={`mobile-bottom-nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
