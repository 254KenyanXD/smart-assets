import { Layer, ManagedRuntime } from "effect";
import type { Database } from "bun:sqlite";

import { layer as directoryLayer } from "@/lib/identity/directory";
import { layer as livePortal, Service as PortalTransport } from "@/lib/identity/portal-transport";
import { layer as custodyLayer, Service as Custody } from "@/services/custody";
import { layer as reportsLayer, Service as Reports } from "@/services/reports";
import { layer as universityLayer, Service as University } from "@/services/university";

/**
 * Services the login plugin, the custody actions, and the report downloads run.
 */
export type AppServices = University | PortalTransport | Custody | Reports;

/**
 * Build the process-wide runtime for one database.
 * The portal layer is replaced in tests.
 *
 * @param database - Open SQLite database.
 * @param portal - Live or test portal transport.
 */
export function makeRuntime(
  database: Database,
  portal: Layer.Layer<PortalTransport> = livePortal,
): ManagedRuntime.ManagedRuntime<AppServices, never> {
  const layer = Layer.mergeAll(
    universityLayer(database).pipe(Layer.provide(directoryLayer)),
    custodyLayer(database),
    reportsLayer(database),
    portal,
  ).pipe(Layer.orDie);
  return ManagedRuntime.make(layer);
}
