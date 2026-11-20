import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, ManagedRuntime } from "effect";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { hashLocalPassword } from "@/lib/auth";
import { layer as custodyLayer, Service as Custody, type Actor } from "@/services/custody";

import {
  code128Video,
  daystarAttendantEmail,
  daystarTitle,
  partialDatabase,
  partialPassword,
  qrVideo,
  sharedTag,
  strathmoreAttendantEmail,
  strathmoreTitle,
  studentEmail,
  studentOfficialId,
} from "./partials-accounts";

const daystar = "uni_daystar";
const strathmore = "uni_strathmore";
const purchasedOn = new Date("2024-01-15T00:00:00.000Z");

function pngSize(file: string): { readonly width: number; readonly height: number } {
  const bytes = readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function evenScale(width: number, height: number): string {
  let factor = Math.max(1, Math.ceil(360 / Math.max(width, height)));
  if ((width * factor) % 2 === 1 || (height * factor) % 2 === 1) factor += 1;
  const scaledWidth = width * factor;
  const scaledHeight = height * factor;
  const padWidth = Math.max(scaledWidth + 40, 480) % 2 === 0 ? Math.max(scaledWidth + 40, 480) : Math.max(scaledWidth + 40, 480) + 1;
  const padHeight = Math.max(scaledHeight + 40, 480) % 2 === 0 ? Math.max(scaledHeight + 40, 480) : Math.max(scaledHeight + 40, 480) + 1;
  return `scale=${scaledWidth}:${scaledHeight}:flags=neighbor,pad=${padWidth}:${padHeight}:(ow-iw)/2:(oh-ih)/2:white`;
}

function writeVideo(png: string, out: string): void {
  const size = pngSize(png);
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-loop",
      "1",
      "-i",
      png,
      "-frames:v",
      "60",
      "-vf",
      evenScale(size.width, size.height),
      "-pix_fmt",
      "yuv420p",
      out,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${png}`);
  }
}

async function plant(): Promise<void> {
  rmSync(partialDatabase, { force: true });
  rmSync(`${partialDatabase}-wal`, { force: true });
  rmSync(`${partialDatabase}-shm`, { force: true });
  mkdirSync("/tmp/smart-assets-partials", { recursive: true });
  const database = openDatabase(partialDatabase);
  applyMigrations(database);
  seed(database);
  const orm = drizzle(database, { schema });
  const now = new Date();
  const password = await hashLocalPassword(partialPassword);

  const people = [
    {
      id: "user_partial_daystar",
      email: daystarAttendantEmail,
      name: "Partial Attendant",
      universityId: daystar,
      role: "attendant",
    },
    {
      id: "user_partial_strath",
      email: strathmoreAttendantEmail,
      name: "Partial Strathmore",
      universityId: strathmore,
      role: "attendant",
    },
    {
      id: "user_partial_student",
      email: studentEmail,
      name: "Partial Student",
      universityId: daystar,
      role: "student",
    },
  ] as const;

  for (const person of people) {
    orm
      .insert(schema.user)
      .values({
        id: person.id,
        name: person.name,
        email: person.email,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
        platformRole: "user",
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
      })
      .run();
    orm
      .insert(schema.account)
      .values({
        id: `account_${person.id}`,
        accountId: person.id,
        providerId: "credential",
        userId: person.id,
        password,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    orm
      .insert(schema.member)
      .values({
        id: `member_${person.id}`,
        organizationId: person.universityId,
        userId: person.id,
        role: person.role,
        createdAt: now,
      })
      .run();
  }
  orm
    .insert(schema.studentProfiles)
    .values({
      id: "profile_partial_student",
      userId: "user_partial_student",
      universityId: daystar,
      officialId: studentOfficialId,
      fullName: "Partial Student",
      programme: null,
      campus: null,
      school: null,
      standing: null,
      email: studentEmail,
      photoUrl: null,
      source: "local",
      firstVerifiedAt: now,
      lastVerifiedAt: now,
    })
    .run();
  orm
    .insert(schema.locations)
    .values({
      id: "loc_partial_counter",
      universityId: daystar,
      departmentId: null,
      name: "Partial counter",
      kind: "counter",
    })
    .run();

  orm
    .insert(schema.user)
    .values({
      id: "user_partial_admin",
      name: "Partial Admin",
      email: "admin.partial@daystar.ac.ke",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      platformRole: "super_admin",
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
    })
    .run();

  const admin: Actor = { userId: "user_partial_admin", platformRole: "super_admin", universityId: daystar };
  const runtime = ManagedRuntime.make(custodyLayer(database));
  try {
    const registered = await runtime.runPromise(
      Effect.gen(function* () {
        const custody = yield* Custody;
        const daystarAsset = yield* custody.register({
          actor: admin,
          tag: sharedTag,
          title: daystarTitle,
          cost: 100000,
          salvage: 10000,
          usefulLifeYears: 5,
          purchasedOn,
          locationId: "loc_partial_counter",
        });
        yield* custody.register({
          actor: { ...admin, universityId: strathmore },
          tag: sharedTag,
          title: strathmoreTitle,
          cost: 100000,
          salvage: 10000,
          usefulLifeYears: 5,
          purchasedOn,
          locationId: null,
        });
        yield* custody.recordMove({
          actor: admin,
          assetId: daystarAsset.id,
          to: "available",
        });
        return daystarAsset.id;
      }),
    );
    const stored = orm.select().from(schema.assets).where(eq(schema.assets.id, registered)).get();
    if (stored?.state !== "available") {
      throw new Error(`Daystar asset is ${stored?.state ?? "missing"}`);
    }
  } finally {
    await runtime.dispose();
  }
  database.close();
}

await plant();
const fixtureDirectory = fileURLToPath(new URL("../tests/fixtures/barcodes/", import.meta.url));
writeVideo(`${fixtureDirectory}code128.png`, code128Video);
writeVideo(`${fixtureDirectory}qrcode.png`, qrVideo);
console.log(`partials database ${partialDatabase}`);
