/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

import { documentFallsBack, networkOnlyRuntime, OFFLINE_PATH } from "./domain/install-shell";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Installable shell.
 *
 * Precache holds the built files and `/offline`.
 * Documents, session calls, and report downloads are network-only.
 * `defaultCache` is not used: it would keep HTML and RSC payloads on the device.
 */
const shell = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher({ request, url, sameOrigin }) {
        return networkOnlyRuntime({
          method: request.method,
          sameOrigin,
          pathname: url.pathname,
        });
      },
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_PATH,
        matcher({ request }) {
          return documentFallsBack(request.destination);
        },
      },
    ],
  },
});

shell.addEventListeners();
