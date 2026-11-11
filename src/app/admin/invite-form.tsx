"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A university the super admin can attach to an invite. */
export interface InviteChoice {
  /** University id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
}

/**
 * Issue one staff invite. The raw link stays on this page and is not stored.
 */
export function InviteForm({ universities }: { readonly universities: readonly InviteChoice[] }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [universityId, setUniversityId] = useState(universities[0]?.id ?? "");
  const [role, setRole] = useState("school_admin");
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setLink(null);
    const response = await fetch("/api/auth/staff-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName, email, role, universityId }),
    });
    setBusy(false);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(messageFrom(body));
      return;
    }
    if (typeof body === "object" && body !== null && "link" in body && typeof body.link === "string") {
      setLink(body.link);
      setFullName("");
      setEmail("");
      return;
    }
    setNotice("The invite could not be created.");
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <h2 className="font-display text-xl font-semibold text-ink">Invite a school administrator</h2>
      <p className="text-sm text-ink2">The link is shown once. They set their own password from it.</p>
      <label className="text-sm text-ink2" htmlFor="invite-name">
        Full name
        <Input
          id="invite-name"
          className="mt-1"
          value={fullName}
          autoComplete="name"
          onChange={(event) => setFullName(event.target.value)}
          required
        />
      </label>
      <label className="text-sm text-ink2" htmlFor="invite-email">
        Email
        <Input
          id="invite-email"
          className="mt-1"
          type="email"
          value={email}
          autoComplete="off"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="text-sm text-ink2" htmlFor="invite-university">
        University
        <select
          id="invite-university"
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          value={universityId}
          onChange={(event) => setUniversityId(event.target.value)}
        >
          {universities.map((university) => (
            <option key={university.id} value={university.id}>
              {university.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-ink2" htmlFor="invite-role">
        Role
        <select
          id="invite-role"
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="school_admin">School administrator</option>
          <option value="dept_head">Department head</option>
          <option value="attendant">Attendant</option>
        </select>
      </label>
      {notice !== null ? <p className="text-sm text-red">{notice}</p> : null}
      {link !== null ? (
        <label className="text-sm text-ink" htmlFor="invite-link">
          Copy this link. It will not be shown again.
          <Input id="invite-link" className="mt-1" readOnly value={link} />
        </label>
      ) : null}
      <Button type="submit" disabled={busy || universityId.length === 0}>
        {busy ? "Creating" : "Create invite"}
      </Button>
    </form>
  );
}

function messageFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return "The invite could not be created.";
}
