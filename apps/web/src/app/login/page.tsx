"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useBranding } from "@/components/providers/BrandingProvider";

export default function LoginPage() {
  const branding = useBranding();
  const [email, setEmail] = useState("admin@aviditytechnologies.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
              className="brand-logo login-brand-logo"
              src={branding.loginLogoUrl ?? branding.logoUrl ?? ""}
              alt=""
              style={{ width: branding.loginLogoWidth ?? 160, height: branding.loginLogoHeight ?? 48 }}
            />
          ) : (
            <span className="brand-mark">{branding.applicationName.slice(0, 1)}</span>
          )}
          <span className="brand-name" style={{ color: branding.brandTextColor ?? "#ffffff", fontSize: branding.brandTextSize ?? 16 }}>
            {branding.applicationName}
          </span>
        </div>
        <div>
          <h1>{branding.loginHeadline ?? branding.applicationName}</h1>
          <p>{branding.loginSubtitle}</p>
        </div>
        <p>{branding.loginFooterText ?? branding.companyName}</p>
      </section>
      <section className="login-panel">
        {branding.loginFormLogoUrl ? (
          <img
            className="login-form-logo"
            src={branding.loginFormLogoUrl}
            alt={branding.applicationName}
            style={{ width: branding.loginFormLogoWidth ?? 220, height: branding.loginFormLogoHeight ?? 72 }}
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
