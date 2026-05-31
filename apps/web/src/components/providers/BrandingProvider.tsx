"use client";

import { PublicBrandingSettings } from "@avidity/shared";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "@/lib/api";

const fallbackBranding: PublicBrandingSettings = {
  applicationName: "Avidity IT Management Tool",
  companyName: "Avidity Technologies",
  logoUrl: null,
  primaryColor: "#155eef",
  secondaryColor: "#0f172a",
  supportEmail: "support@aviditytechnologies.com"
};

const BrandingContext = createContext<PublicBrandingSettings>(fallbackBranding);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PublicBrandingSettings>(fallbackBranding);

  useEffect(() => {
    let mounted = true;

    fetch(`${apiBaseUrl}/system-settings/public-branding`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : fallbackBranding))
      .then((settings: PublicBrandingSettings) => {
        if (mounted) {
          setBranding(settings);
          document.documentElement.style.setProperty("--brand-primary", settings.primaryColor);
          document.documentElement.style.setProperty("--brand-secondary", settings.secondaryColor);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => branding, [branding]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
