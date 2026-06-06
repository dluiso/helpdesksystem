"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useBranding } from "@/components/providers/BrandingProvider";

function brandingFontFamily(value?: string) {
  if (value === "serif") return "Georgia, 'Times New Roman', serif";
  if (value === "mono") return "'SFMono-Regular', Consolas, monospace";
  return "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
}

export default function LoginPage() {
  const branding = useBranding();
  const [email, setEmail] = useState("admin@aviditytechnologies.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const logoBackgroundStyle = {
    background: branding.brandLogoTransparentBackground ? "transparent" : (branding.brandLogoBackgroundColor ?? "#ffffff")
  };
  const showLoginBrandTitle = branding.showLoginBrandTitle !== false;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      window.location.assign("/dashboard");
    } catch {
      setError("The email or password was not accepted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-copy">
        <div className="brand">
          {branding.loginLogoUrl || branding.logoUrl ? (
            <img
              className="brand-logo login-brand-logo desktop-brand-logo"
              src={branding.loginLogoUrl ?? branding.logoUrl ?? ""}
              alt=""
              style={{ ...logoBackgroundStyle, width: branding.loginLogoWidth ?? 160, height: branding.loginLogoHeight ?? 48 }}
            />
          ) : null}
          {branding.mobileLoginLogoUrl || branding.loginLogoUrl || branding.logoUrl ? (
            <img
              className="brand-logo login-brand-logo mobile-brand-logo"
              src={branding.mobileLoginLogoUrl ?? branding.loginLogoUrl ?? branding.logoUrl ?? ""}
              alt=""
              style={{ ...logoBackgroundStyle, width: branding.mobileLoginLogoWidth ?? 140, height: branding.mobileLoginLogoHeight ?? 44 }}
            />
          ) : (
            <span className="brand-mark">{branding.applicationName.slice(0, 1)}</span>
          )}
          {showLoginBrandTitle ? (
            <span className={`brand-title-wrap subtitle-${branding.subtitlePlacement === "RIGHT" ? "right" : "below"} mobile-subtitle-${branding.mobileSubtitlePlacement === "RIGHT" ? "right" : "below"}`}>
              <span
                className="brand-name login-brand-name desktop-brand-title"
                style={{
                  color: branding.brandTextColor ?? "#ffffff",
                  fontSize: branding.brandTextSize ?? 16,
                  fontFamily: brandingFontFamily(branding.brandFontFamily)
                }}
              >
                {branding.applicationName}
              </span>
              <span
                className="brand-name login-brand-name mobile-brand-title"
                style={{
                  color: branding.mobileLoginBrandTextColor ?? "#ffffff",
                  fontSize: branding.mobileLoginBrandTextSize ?? 16,
                  fontFamily: brandingFontFamily(branding.brandFontFamily)
                }}
              >
                {branding.applicationName}
              </span>
              {branding.showSubtitleOnLogin && branding.appSubtitle ? (
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
          ) : null}
        </div>
        <div>
          <h1
            style={{
              color: branding.loginHeadlineColor ?? "#ffffff",
              fontSize: branding.loginHeadlineSize ?? 48,
              fontWeight: branding.loginHeadlineWeight ?? "800",
              fontStyle: branding.loginHeadlineStyle ?? "normal",
              fontFamily: brandingFontFamily(branding.loginHeadlineFontFamily)
            }}
          >
            {branding.loginHeadline ?? branding.applicationName}
          </h1>
          <p
            className="login-subtitle"
            style={{
              color: branding.loginSubtitleColor ?? "#ffffff",
              fontSize: branding.loginSubtitleSize ?? 18,
              fontWeight: branding.loginSubtitleWeight ?? "400",
              fontStyle: branding.loginSubtitleStyle ?? "normal",
              textAlign: (branding.loginSubtitleAlign ?? "left") as "left" | "center" | "right",
              fontFamily: brandingFontFamily(branding.loginSubtitleFontFamily)
            }}
          >
            {branding.loginSubtitle}
          </p>
        </div>
        <p
          className="login-footer-text"
          style={{
            color: branding.loginFooterColor ?? "#ffffff",
            fontSize: branding.loginFooterSize ?? 18,
            fontWeight: branding.loginFooterWeight ?? "400",
            fontStyle: branding.loginFooterStyle ?? "normal",
            fontFamily: brandingFontFamily(branding.loginFooterFontFamily)
          }}
        >
          {branding.loginFooterText ?? branding.companyName}
        </p>
      </section>
      <section className="login-panel">
        {branding.loginFormLogoUrl ? (
          <img
            className="login-form-logo"
            src={branding.loginFormLogoUrl}
            alt={branding.applicationName}
            style={{ ...logoBackgroundStyle, width: branding.loginFormLogoWidth ?? 220, height: branding.loginFormLogoHeight ?? 72 }}
          />
        ) : null}
        <div className="page-header">
          <div>
            <h1>Sign In</h1>
            <p className="muted">Use your technician or administrator account.</p>
          </div>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              className="input"
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? <div className="error">{error}</div> : null}
          <button className="button" type="submit" disabled={loading}>
            <LogIn size={16} aria-hidden="true" />
            <span>{loading ? "Signing in" : "Sign in"}</span>
          </button>
        </form>
      </section>
    </div>
  );
}
