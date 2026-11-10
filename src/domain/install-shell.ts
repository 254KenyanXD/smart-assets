/** Path of the page shown when a document cannot be loaded. */
export const OFFLINE_PATH = "/offline";

const SHELL_PREFIXES = ["/_next/static/", "/brand/", "/icons/"] as const;

/**
 * Whether a same-origin path is part of the built shell.
 *
 * The precache stores these files. Documents, API calls, and report downloads
 * are not in this set: a shared desk phone must not keep another person's pages.
 *
 * @param pathname - The URL path, without a query.
 * @returns `precache` for built shell files, otherwise `network-only`.
 */
export function shellCache(pathname: string): "precache" | "network-only" {
  if (SHELL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "precache";
  return "network-only";
}

/**
 * Whether the service worker should claim this GET and refuse to store it.
 *
 * @param input - The request the worker is matching.
 * @returns True when the runtime strategy is network-only.
 */
export function networkOnlyRuntime(input: {
  readonly method: string;
  readonly sameOrigin: boolean;
  readonly pathname: string;
}): boolean {
  if (!input.sameOrigin || input.method !== "GET") return false;
  return shellCache(input.pathname) === "network-only";
}

/**
 * Whether a failed navigation should open the offline page.
 *
 * @param destination - The request destination from the browser.
 * @returns True for document navigations.
 */
export function documentFallsBack(destination: string): boolean {
  return destination === "document";
}
