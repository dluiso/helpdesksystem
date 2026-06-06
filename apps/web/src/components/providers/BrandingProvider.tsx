"use client";

import { PublicBrandingSettings } from "@avidity/shared";
import { usePathname } from "next/navigation";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "@/lib/api";

const fallbackBranding: PublicBrandingSettings = {
  applicationName: "Avidity IT Management Tool",
  companyName: "Avidity Technologies",
  logoUrl: null,
  loginLogoUrl: null,
  loginFormLogoUrl: null,
  mobileLogoUrl: null,
  mobileLoginLogoUrl: null,
  appIconUrl: null,
  loginLogoWidth: 160,
  loginLogoHeight: 48,
  loginFormLogoWidth: 220,
  loginFormLogoHeight: 72,
  brandTextSize: 16,
  brandTextColor: "#ffffff",
  brandLogoBackgroundColor: "#ffffff",
  brandLogoTransparentBackground: false,
  appBrandTextSize: 16,
  appBrandTextColor: "#ffffff",
  mobileLogoWidth: 34,
  mobileLogoHeight: 34,
  mobileBrandTextSize: 16,
  mobileBrandTextColor: "#ffffff",
  mobileLoginLogoWidth: 140,
  mobileLoginLogoHeight: 44,
  mobileLoginBrandTextSize: 16,
  mobileLoginBrandTextColor: "#ffffff",
  brandFontFamily: "system",
  appSubtitle: null,
  showLoginBrandTitle: true,
  showSubtitleOnLogin: false,
  showSubtitleInApp: false,
  subtitlePlacement: "BELOW",
  mobileSubtitlePlacement: "BELOW",
  subtitleSize: 14,
  subtitleColor: "#cbd5e1",
  subtitleWeight: "400",
  subtitleStyle: "normal",
  subtitleFontFamily: "system",
  primaryColor: "#155eef",
  secondaryColor: "#0f172a",
  supportEmail: "support@aviditytechnologies.com",
  supportButtonEnabled: true,
  supportButtonLabel: "Support",
  supportButtonUrl: null,
  defaultLandingPage: "/dashboard",
  defaultTimezone: "America/Chicago",
  defaultLanguage: "en",
  dateFormat: "MMM dd, yyyy",
  timeFormat: "12h",
  loginHeadline: "Avidity IT Management Tool",
  loginSubtitle: "Secure service desk operations, client context, attachments, mail flow, reporting, and remote access readiness in one configurable platform.",
  loginFooterText: "Avidity Technologies",
  loginHeadlineSize: 48,
  loginHeadlineColor: "#ffffff",
  loginHeadlineWeight: "800",
  loginHeadlineStyle: "normal",
  loginHeadlineFontFamily: "system",
  loginSubtitleSize: 18,
  loginSubtitleColor: "#ffffff",
  loginSubtitleWeight: "400",
  loginSubtitleStyle: "normal",
  loginSubtitleAlign: "left",
  loginSubtitleFontFamily: "system",
  loginFooterSize: 18,
  loginFooterColor: "#ffffff",
  loginFooterWeight: "400",
  loginFooterStyle: "normal",
  loginFooterFontFamily: "system"
};

const BrandingContext = createContext<PublicBrandingSettings>(fallbackBranding);

const pageTitleByPath: Array<[RegExp, string]> = [
  [/^\/tickets(\/|$)/, "Tickets"],
  [/^\/event-services(\/|$)/, "Event & Services"],
  [/^\/public\/event-services(\/|$)/, "Event & Services"],
  [/^\/dashboard(\/|$)/, "Dashboard"],
  [/^\/clients(\/|$)/, "Clients"],
  [/^\/devices(\/|$)/, "Devices"],
  [/^\/reports(\/|$)/, "Reports"],
  [/^\/knowledge-base(\/|$)/, "Knowledge Base"],
  [/^\/users(\/|$)/, "Users"],
  [/^\/profile(\/|$)/, "Profile"],
  [/^\/settings(\/|$)/, "Settings"],
  [/^\/login(\/|$)/, "Sign In"]
];

function pageTitle(pathname: string) {
  return pageTitleByPath.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PublicBrandingSettings>(fallbackBranding);
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    fetch(`${apiBaseUrl}/system-settings/public-branding`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : fallbackBranding))
      .then((settings: PublicBrandingSettings) => {
        if (mounted) {
          setBranding(settings);
          document.documentElement.style.setProperty("--brand-primary", settings.primaryColor);
          document.documentElement.style.setProperty("--brand-secondary", settings.secondaryColor);
          if (settings.appIconUrl) {
            let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
            if (!icon) {
              icon = document.createElement("link");
              icon.rel = "icon";
              document.head.appendChild(icon);
            }
            icon.href = settings.appIconUrl;
          }
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sectionTitle = pageTitle(pathname);
    document.title = sectionTitle ? `${sectionTitle} - ${branding.applicationName}` : branding.applicationName;
  }, [branding.applicationName, pathname]);

  const value = useMemo(() => branding, [branding]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
