import { parse } from "node-html-parser";
import { Effect, Schema } from "effect";

import { PortalChanged } from "@/lib/identity/errors";

export const DashboardProfile = Schema.Struct({
  regno: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  school: Schema.optionalKey(Schema.String),
  campus: Schema.optionalKey(Schema.String),
  programme: Schema.optionalKey(Schema.String),
  degree: Schema.optionalKey(Schema.String),
  academicstatus: Schema.optionalKey(Schema.String),
  email: Schema.optionalKey(Schema.String),
  photoUrl: Schema.optionalKey(Schema.String),
});

export interface DashboardProfile extends Schema.Schema.Type<typeof DashboardProfile> {}

export function profileKey(label: string): string {
  return label.toLowerCase().replace(/[.\s]/g, "");
}

export function parseDashboard(html: string): Effect.Effect<DashboardProfile, PortalChanged> {
  const root = parse(html);
  const fields: Record<string, string> = {};
  for (const row of root.querySelectorAll("div")) {
    const className = row.getAttribute("class") ?? "";
    if (!className.startsWith("row mb-")) {
      continue;
    }
    const label = row.querySelector("label")?.text.trim();
    const value = row.querySelector(".badge")?.text.trim();
    if (label === undefined || label.length === 0 || value === undefined || value.length === 0) {
      continue;
    }
    fields[profileKey(label)] = value;
  }
  const photo = root.querySelector(".rounded-circle")?.getAttribute("src")?.trim();
  return Schema.decodeUnknownEffect(DashboardProfile)({
    ...fields,
    ...(photo === undefined || photo.length === 0 ? {} : { photoUrl: photo }),
  }).pipe(
    Effect.flatMap((profile) => {
      if (profile.regno === undefined || profile.name === undefined) {
        return Effect.fail(
          new PortalChanged({
            message: "The portal page did not include a registration number and a name.",
          }),
        );
      }
      return Effect.succeed(profile);
    }),
    Effect.mapError((cause) =>
      cause instanceof PortalChanged
        ? cause
        : new PortalChanged({
            message: "The portal page could not be read as a student profile.",
          }),
    ),
  );
}
