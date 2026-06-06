"use client";

import { FormEvent, useMemo, useState } from "react";
import { LogIn } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function ResetPasswordPage() {
  const token = useMemo(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? ""), []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("The password confirmation does not match.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword })
      });
      setMessage("Password reset completed. You can sign in with the new password.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page reset-password-page">
      <section className="login-panel reset-password-panel">
        <div className="page-header">
          <div>
            <h1>Reset Password</h1>
            <p className="muted">Enter a new password for your account.</p>
          </div>
        </div>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <input className="input" id="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input className="input" id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} />
          </div>
          {message ? <div className="success-banner compact-banner">{message}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          <button className="button" type="submit" disabled={loading || !token}>
            <LogIn size={16} aria-hidden="true" />
            <span>{loading ? "Saving" : "Reset Password"}</span>
          </button>
          <a className="button ghost" href="/login">Back to sign in</a>
        </form>
      </section>
    </main>
  );
}
