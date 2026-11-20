"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { CustodyMark } from "@/components/custody-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResolveBody } from "@/lib/resolve-body";

type EmailFields = { email: string };
type LocalFields = { password: string };
type LinkFields = {
  portalUsername: string;
  portalPassword: string;
  localPassword: string;
  confirmPassword: string;
  consent: boolean;
};

type Supported = Extract<ResolveBody, { supported: true }>;

function isSupported(body: ResolveBody): body is Supported {
  return body.supported === true;
}

function isMany(body: ResolveBody): body is Extract<ResolveBody, { many: true }> {
  return "many" in body && body.many === true;
}

function isDirectory(body: ResolveBody): body is Extract<ResolveBody, { supported: false; name: string }> {
  return body.supported === false && "name" in body;
}

async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return "That did not work. Try again.";
}

export function SignInForm() {
  const emailForm = useForm<EmailFields>({ defaultValues: { email: "" } });
  const localForm = useForm<LocalFields>({ defaultValues: { password: "" } });
  const linkForm = useForm<LinkFields>({
    defaultValues: {
      portalUsername: "",
      portalPassword: "",
      localPassword: "",
      confirmPassword: "",
      consent: false,
    },
  });
  const [resolved, setResolved] = useState<ResolveBody | null>(null);
  const [mode, setMode] = useState<"local" | "link">("local");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const email = emailForm.watch("email");

  async function lookup(university?: string) {
    setBusy(true);
    setNotice(null);
    const params = new URLSearchParams({ email: email.trim() });
    if (university !== undefined) {
      params.set("university", university);
    }
    const response = await fetch(`/api/universities/resolve?${params.toString()}`);
    setBusy(false);
    if (response.status === 404) {
      setResolved({ supported: false });
      setMode("local");
      return;
    }
    if (!response.ok) {
      setNotice(await errorMessage(response));
      return;
    }
    const body = (await response.json()) as ResolveBody;
    setResolved(body);
    setMode("local");
    if (isSupported(body) && body.admissionNumber !== null) {
      linkForm.setValue("portalUsername", body.admissionNumber);
    }
  }

  async function signIn(fields: LocalFields) {
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password: fields.password }),
    });
    setBusy(false);
    if (!response.ok) {
      localForm.reset({ password: "" });
      setNotice(await errorMessage(response));
      return;
    }
    window.location.assign("/home");
  }

  async function link(fields: LinkFields) {
    if (fields.localPassword !== fields.confirmPassword) {
      setNotice("The two local passwords do not match.");
      return;
    }
    if (!fields.consent) {
      setNotice("Confirm that the portal password is checked once and not stored.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/auth/link-university", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        portalUsername: fields.portalUsername.trim(),
        portalPassword: fields.portalPassword,
        localPassword: fields.localPassword,
        consent: true,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      linkForm.setValue("portalPassword", "");
      linkForm.setValue("localPassword", "");
      linkForm.setValue("confirmPassword", "");
      setNotice(await errorMessage(response));
      return;
    }
    window.location.assign("/home");
  }

  const tenant = resolved !== null && isSupported(resolved) ? resolved.name : "University email";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 lg:hidden">
        <CustodyMark />
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink3">UNIVERSITY SMART-ASSETS</p>
          <p className="text-xs text-ink2">{tenant}</p>
        </div>
      </div>

      <div>
        <h1 className="font-display text-[32px] font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink2 lg:hidden">Sign in with your university email.</p>
      </div>

      {resolved === null ? (
        <form className="flex flex-col gap-3" onSubmit={emailForm.handleSubmit(() => void lookup())}>
          <label className="text-sm text-ink" htmlFor="email">
            University email
          </label>
          <Input id="email" type="email" autoComplete="username" {...emailForm.register("email", { required: true })} />
          <Button type="submit" disabled={busy}>
            Continue
          </Button>
        </form>
      ) : null}

      {resolved !== null && !isSupported(resolved) && !isMany(resolved) && !isDirectory(resolved) ? (
        <p className="text-sm text-ink2">This university is not recognised yet.</p>
      ) : null}

      {resolved !== null && isDirectory(resolved) ? (
        <div className="flex flex-col gap-2 text-sm text-ink2">
          <p className="text-ink">{resolved.name}</p>
          <p>{resolved.country}</p>
          <p>Not supported yet.</p>
        </div>
      ) : null}

      {resolved !== null && isMany(resolved) ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink2">This domain matches more than one institution.</p>
          {resolved.institutions.map((institution) =>
            institution.slug === null ? (
              <p key={institution.name} className="text-sm text-ink">
                {institution.name}
                {institution.country.length > 0 ? `, ${institution.country}` : ""}
              </p>
            ) : (
              <Button key={institution.slug} variant="quiet" disabled={busy} onClick={() => void lookup(institution.slug ?? undefined)}>
                {institution.name}
              </Button>
            ),
          )}
        </div>
      ) : null}

      {resolved !== null && isSupported(resolved) && resolved.status === "suspended" ? (
        <p className="rounded-xl bg-amberbg px-3 py-2 text-sm text-amber">This university is suspended.</p>
      ) : null}

      {resolved !== null && isSupported(resolved) && resolved.status === "active" && mode === "local" ? (
        <form className="flex flex-col gap-3" onSubmit={localForm.handleSubmit((fields) => void signIn(fields))}>
          {resolved.adapter === "daystar-portal" && resolved.portal === "staff" ? (
            <p className="text-sm text-ink2">Staff sign in with an invite, not a portal password.</p>
          ) : null}
          {resolved.adapter === "local" ? (
            <p className="text-sm text-ink2">New staff accounts are created from an invite.</p>
          ) : null}
          <label className="text-sm text-ink" htmlFor="local-password">
            Local password
          </label>
          <Input
            id="local-password"
            type="password"
            autoComplete="current-password"
            {...localForm.register("password", { required: true })}
          />
          <Button type="submit" disabled={busy}>
            Sign in
          </Button>
          {resolved.adapter === "daystar-portal" ? (
            <Button
              variant="quiet"
              onClick={() => {
                setNotice(null);
                if (resolved.portal === "staff") {
                  linkForm.setValue("portalUsername", "");
                }
                setMode("link");
              }}
            >
              {resolved.portal === "staff" ? "I'm a student" : "First time? Link your university account"}
            </Button>
          ) : null}
        </form>
      ) : null}

      {resolved !== null && isSupported(resolved) && mode === "link" ? (
        <form className="flex flex-col gap-3" onSubmit={linkForm.handleSubmit((fields) => void link(fields))}>
          <label className="text-sm text-ink" htmlFor="admission">
            Admission number
          </label>
          <Input id="admission" autoComplete="off" {...linkForm.register("portalUsername", { required: true })} />
          <label className="text-sm text-ink" htmlFor="portal-password">
            Portal password
          </label>
          <Input
            id="portal-password"
            type="password"
            autoComplete="off"
            {...linkForm.register("portalPassword", { required: true })}
          />
          <label className="text-sm text-ink" htmlFor="new-password">
            New local password
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...linkForm.register("localPassword", { required: true, minLength: 8 })}
          />
          <label className="text-sm text-ink" htmlFor="confirm-password">
            Confirm local password
          </label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            {...linkForm.register("confirmPassword", { required: true, minLength: 8 })}
          />
          <label className="flex items-start gap-2 text-sm text-ink2" htmlFor="consent">
            <input id="consent" type="checkbox" className="mt-1" {...linkForm.register("consent")} />
            Your portal password is checked once against the university portal and is not stored.
          </label>
          <Button type="submit" disabled={busy}>
            Link account
          </Button>
        </form>
      ) : null}

      {notice !== null ? <p className="rounded-xl bg-redbg px-3 py-2 text-sm text-red">{notice}</p> : null}

      {resolved !== null ? (
        <button
          type="button"
          className="text-left text-sm text-ink2"
          onClick={() => {
            setResolved(null);
            setMode("local");
            setNotice(null);
          }}
        >
          Use a different email
        </button>
      ) : null}
    </div>
  );
}
