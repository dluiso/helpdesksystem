"use client";

import { dashboardNavigation } from "@avidity/ui";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Gauge,
  HardDrive,
  LifeBuoy,
  Menu,
  Monitor,
  Settings,
  UserRound,
  Ticket
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { apiFetch } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";
import { SystemStatusClock } from "./SystemStatusClock";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

const iconMap = {
  Dashboard: Gauge,
  Tickets: Ticket,
  "Event & Services": CalendarDays,
  Clients: Building2,
  Devices: HardDrive,
  Reports: BarChart3,
  "Knowledge Base": BookOpen,
  Profile: UserRound,
  Settings
};

function brandingFontFamily(value?: string) {
  if (value === "serif") return "Georgia, 'Times New Roman', serif";
  if (value === "mono") return "'SFMono-Regular', Consolas, monospace";
  return "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
}

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
    () => dashboardNavigation.filter((item) => item.label !== "Users" && (!item.permission || userPermissions.has(item.permission))),
    [userPermissions]
  );
  const primaryMobileNavigation = useMemo(
    () => navigation.filter((item) => ["Dashboard", "Tickets", "Event & Services", "Settings"].includes(item.label)).slice(0, 4),
    [navigation]
  );

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const logoBackgroundStyle = {
    background: branding.brandLogoTransparentBackground ? "transparent" : (branding.brandLogoBackgroundColor ?? "#ffffff")
  };

  return (
    <div className="shell">
      {mobileNavOpen ? <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} /> : null}
      <aside className={`sidebar${mobileNavOpen ? " mobile-open" : ""}`}>
        <Link className="brand" href="/dashboard">
          {branding.logoUrl ? <img className="brand-logo desktop-brand-logo" src={branding.logoUrl} alt="" style={logoBackgroundStyle} /> : null}
          {branding.mobileLogoUrl || branding.logoUrl ? (
            <img className="brand-logo mobile-brand-logo" src={branding.mobileLogoUrl ?? branding.logoUrl ?? ""} alt="" style={{ ...logoBackgroundStyle, width: branding.mobileLogoWidth ?? 34, height: branding.mobileLogoHeight ?? 34 }} />
          ) : null}
          {!branding.logoUrl && !branding.mobileLogoUrl ? <span className="brand-mark">{branding.applicationName.slice(0, 1)}</span> : null}
          <span className={`brand-title-wrap subtitle-${branding.subtitlePlacement === "RIGHT" ? "right" : "below"} mobile-subtitle-${branding.mobileSubtitlePlacement === "RIGHT" ? "right" : "below"}`}>
            <span className="brand-name desktop-brand-title" style={{ color: branding.appBrandTextColor ?? "#ffffff", fontSize: branding.appBrandTextSize ?? 16, fontFamily: brandingFontFamily(branding.brandFontFamily) }}>
              {branding.applicationName}
            </span>
            <span className="brand-name mobile-brand-title" style={{ color: branding.mobileBrandTextColor ?? "#ffffff", fontSize: branding.mobileBrandTextSize ?? 16, fontFamily: brandingFontFamily(branding.brandFontFamily) }}>
              {branding.applicationName}
            </span>
            {branding.showSubtitleInApp && branding.appSubtitle ? (
              <span
                className="brand-subtitle"
                style={{
                  color: branding.subtitleColor ?? "#cbd5e1",
                  fontSize: branding.subtitleSize ?? 14,
                  fontWeight: branding.subtitleWeight ?? "400",
                  fontStyle: branding.subtitleStyle ?? "normal",
                  fontFamily: brandingFontFamily(branding.subtitleFontFamily)
                }}
              >
                {branding.appSubtitle}
              </span>
            ) : null}
          </span>
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = iconMap[item.label as keyof typeof iconMap] ?? LifeBuoy;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const eventServicesActive = item.label === "Event & Services" && active;
            return (
              <div className="nav-item-group" key={item.href}>
                <Link className={`nav-link${active ? " active" : ""}`} href={item.href}>
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
                {eventServicesActive ? (
                  <div className="nav-submenu" aria-label="Event & Services subnavigation">
                    <Link className={pathname === "/event-services" ? "active" : ""} href="/event-services">Requests</Link>
                    <Link className={pathname === "/event-services/calendar" ? "active" : ""} href="/event-services/calendar">Calendar View</Link>
                  </div>
                ) : null}
              </div>
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
            {branding.supportButtonEnabled !== false ? <button className="button secondary" type="button" onClick={() => branding.supportButtonUrl ? window.open(branding.supportButtonUrl, "_blank", "noopener,noreferrer") : undefined}>
              <LifeBuoy size={16} aria-hidden="true" />
              <span>{branding.supportButtonLabel ?? "Support"}</span>
            </button> : null}
            <a className="topbar-rmm-button" href="https://rmm.aviditytechnologies.com/" target="_blank" rel="noopener noreferrer" title="Open RMM">
              <Monitor size={16} aria-hidden="true" />
              <span>RMM</span>
            </a>
            <SystemStatusClock />
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
