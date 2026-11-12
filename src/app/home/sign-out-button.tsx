"use client";

import { Button } from "@/components/ui/button";

/**
 * End the local session and return to the email field.
 * The sign-out route rejects a POST with no content type, so this sends JSON
 * and leaves the page only after the server has deleted the session.
 */
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
