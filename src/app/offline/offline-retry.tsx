"use client";

import { Button } from "@/components/ui/button";

/** Reloads the page. A loan is not stored here. */
export function OfflineRetry() {
  return (
    <Button
      onClick={() => {
        window.location.reload();
      }}
    >
      Try again
    </Button>
  );
}
