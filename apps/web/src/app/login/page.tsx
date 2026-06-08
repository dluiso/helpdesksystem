"use client";

import { FormEvent, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import Script from "next/script";
import { apiFetch } from "@/lib/api";
import { useBranding } from "@/components/providers/BrandingProvider";

declare global {
  interface Window {
    turnstile?: {
      reset: () => void;
    };
  }
}

function brandingFontFamily(value?: string) {
  if (value === "serif") return "Georgia, 'Times New Roman', serif";
  if (value === "mono") return "'SFMono-Regular', Consolas, monospace";
  return "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
}

export default function LoginPage() {
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaTrustedDeviceDays, setMfaTrustedDeviceDays] = useState(30);
  const [trustDevice, setTrustDevice] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [publicAuth, setPublicAuth] = useState<{ passwordResetEnabled: boolean; turnstileSiteKey: string | null; turnstileProtectLogin: boolean; turnstileProtectPasswordReset: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const logoBackgroundStyle = {
    background: branding.brandLogoTransparentBackground ? "transparent" : (branding.brandLogoBackgroundColor ?? "#ffffff")
  };
  const showLoginBrandTitle = branding.showLoginBrandTitle !== false;

  useEffect(() => {
    void apiFetch<{ passwordResetEnabled: boolean; turnstileSiteKey: string | null; turnstileProtectLogin: boolean; turnstileProtectPasswordReset: boolean }>("/system-settings/public-auth")
      .then((settings) => setPublicAuth(settings))
      .catch(() => setPublicAuth({ passwordResetEnabled: false, turnstileSiteKey: null, turnstileProtectLogin: false, turnstileProtectPasswordReset: false }));
  }, []);

  function resetTurnstile() {
    window.turnstile?.reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const captchaToken = String(new FormData(event.currentTarget).get("cf-turnstile-response") ?? "");
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const result = await apiFetch<{ mfaRequired?: boolean; challengeToken?: string; trustedDeviceDays?: number; user?: unknown }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, captchaToken: captchaToken || undefined })
      });
      if (result.mfaRequired && result.challengeToken) {
        setMfaChallengeToken(result.challengeToken);
        setMfaTrustedDeviceDays(result.trustedDeviceDays ?? 30);
        setTrustDevice(false);
        setPassword("");
        setMfaCode("");
        return;
      }
      window.location.assign("/dashboard");
    } catch (caught) {
      resetTurnstile();
      const message = caught instanceof Error ? caught.message : "";
      setError(message.startsWith("Security verification") ? message : "The email or password was not accepted.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaChallengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/mfa/verify-login", {
        method: "POST",
        body: JSON.stringify({ challengeToken: mfaChallengeToken, code: mfaCode, trustDevice })
      });
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The authentication code was not accepted.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const captchaToken = String(new FormData(event.currentTarget).get("cf-turnstile-response") ?? "");
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email, captchaToken: captchaToken || undefined })
      });
      setNotice("If that email exists, password reset instructions were sent.");
    } catch (caught) {
      resetTurnstile();
      setError(caught instanceof Error ? caught.message : "Unable to request password reset.");
    } finally {
      setLoading(false);
    }
  }

  function turnstileMarkup(flow: "login" | "passwordReset") {
    const enabled = publicAuth?.turnstileSiteKey && (flow === "login" ? publicAuth.turnstileProtectLogin : publicAuth.turnstileProtectPasswordReset);
    return enabled ? (
      <>
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
        <div className="cf-turnstile" data-sitekey={publicAuth.turnstileSiteKey} />
      </>
    ) : null;
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
            <h1>{mfaChallengeToken ? "Two-Factor Authentication" : mode === "forgot" ? "Reset Password" : "Sign In"}</h1>
            <p className="muted">{mfaChallengeToken ? "Enter the code from your authenticator app or a recovery code." : mode === "forgot" ? "Enter your account email to receive a reset link." : "Use your technician or administrator account."}</p>
          </div>
        </div>
        {mfaChallengeToken ? (
        <form className="form" onSubmit={handleMfaSubmit}>
          <div className="field">
            <label htmlFor="mfaCode">Authentication code</label>
            <input className="input" id="mfaCode" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required />
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
            <span>Trust this device for {mfaTrustedDeviceDays} days</span>
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="button" type="submit" disabled={loading}>
            <LogIn size={16} aria-hidden="true" />
            <span>{loading ? "Verifying" : "Verify and sign in"}</span>
          </button>
          <button className="button ghost" type="button" onClick={() => setMfaChallengeToken(null)}>Back to login</button>
        </form>
        ) : mode === "forgot" ? (
        <form className="form" onSubmit={handleForgotPassword}>
          <div className="field">
            <label htmlFor="resetEmail">Email</label>
            <input className="input" id="resetEmail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          {turnstileMarkup("passwordReset")}
          {notice ? <div className="success-banner compact-banner">{notice}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          <button className="button" type="submit" disabled={loading}>
            <span>{loading ? "Sending" : "Send reset link"}</span>
          </button>
          <button className="button ghost" type="button" onClick={() => setMode("login")}>Back to sign in</button>
        </form>
        ) : (
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
          {turnstileMarkup("login")}
          {error ? <div className="error">{error}</div> : null}
          <button className="button" type="submit" disabled={loading}>
            <LogIn size={16} aria-hidden="true" />
            <span>{loading ? "Signing in" : "Sign in"}</span>
          </button>
          {publicAuth?.passwordResetEnabled ? (
            <button className="button ghost" type="button" onClick={() => setMode("forgot")}>Forgot password?</button>
          ) : null}
        </form>
        )}
      </section>
    </div>
  );
}
