"use client";

import { useState } from "react";

import { reportFound } from "@/app/desk/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FoundTag() {
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-4"
      action={async (formData) => {
        const result = await reportFound(formData);
        setMessage(result.message);
        setTitle(result.foundTitle);
        setLocation(result.foundLocation);
      }}
    >
      <h2 className="font-display text-lg font-semibold text-ink">Found a tag</h2>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Asset tag
        <Input name="tag" required maxLength={64} autoCapitalize="off" />
      </label>
      <Button type="submit">Report found tag</Button>
      {message !== null ? <p className="text-sm text-ink2">{message}</p> : null}
      {title !== null ? (
        <p className="text-sm text-ink">
          {title}
          {location === null ? ". No location is recorded." : ` at ${location}.`}
        </p>
      ) : null}
    </form>
  );
}
