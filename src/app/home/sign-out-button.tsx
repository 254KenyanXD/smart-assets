"use client";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      variant="quiet"
      onClick={() => {
        void endSession();
      }}
    >
      Sign out
    </Button>
  );
}

async function endSession(): Promise<void> {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    return;
  }
  window.location.assign("/sign-in");
}
