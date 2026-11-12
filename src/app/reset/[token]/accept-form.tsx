"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RESET_INVALID_MESSAGE } from "@/domain/password-reset";
import type { OpenReset } from "@/lib/password-reset-store";

/**
 * Password form for one live reset link.
 * The token stays in the request body and is not written into the database.
 */
export function AcceptResetForm({
  token,
  reset,
}: {
  readonly token: string;
  readonly reset: OpenReset;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setNotice("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/auth/accept-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (!response.ok) {
      setBusy(false);
      setPassword("");
      setConfirm("");
      const body: unknown = await response.json().catch(() => null);
      setNotice(messageFrom(body));
      return;
    }
    window.location.assign("/home");
  }

  return (
    <form className="mt-6 flex flex-col gap-3" onSubmit={submit}>
      <p className="text-sm text-ink">{reset.fullName}</p>
      <p className="text-sm text-ink2">{reset.email}</p>
      <p className="text-sm text-ink2">
        {reset.roleLabel} at {reset.universityName}
      </p>
      <label className="text-sm text-ink2" htmlFor="reset-password">
        Password
        <Input
          id="reset-password"
          className="mt-1"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label className="text-sm text-ink2" htmlFor="reset-confirm">
        Confirm password
        <Input
          id="reset-confirm"
          className="mt-1"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </label>
      {notice !== null ? <p className="text-sm text-red">{notice}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving" : "Set password and sign in"}
      </Button>
    </form>
  );
}

function messageFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return RESET_INVALID_MESSAGE;
}
