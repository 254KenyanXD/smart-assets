
export const OFFLINE_PATH = "/offline";

const SHELL_PREFIXES = ["/_next/static/", "/brand/", "/icons/"] as const;

export function shellCache(pathname: string): "precache" | "network-only" {
  if (SHELL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "precache";
  return "network-only";
}

export function networkOnlyRuntime(input: {
  readonly method: string;
  readonly sameOrigin: boolean;
  readonly pathname: string;
}): boolean {
  if (!input.sameOrigin || input.method !== "GET") return false;
  return shellCache(input.pathname) === "network-only";
}

export function documentFallsBack(destination: string): boolean {
  return destination === "document";
}
