"use server";

import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import * as schema from "@/db/schema";
import { findBorrower } from "@/lib/asset-store";
import { auth, orm, runtime } from "@/lib/auth-server";
import { Service as Custody, type Actor } from "@/services/custody";

export interface DeskResult {
  readonly message: string | null;

  readonly foundTitle: string | null;

  readonly foundLocation: string | null;
}

const emptyFound: Pick<DeskResult, "foundTitle" | "foundLocation"> = {
  foundTitle: null,
  foundLocation: null,
};

export interface BorrowerPreview {
  readonly message: string | null;

  readonly name: string | null;

  readonly officialId: string | null;

  readonly photoUrl: string | null;
}

const deniedPreview: BorrowerPreview = {
  message: "You cannot record that change.",
  name: null,
  officialId: null,
  photoUrl: null,
};

const unknownBorrower: BorrowerPreview = {
  message: "The borrower is not a student at this university.",
  name: null,
  officialId: null,
  photoUrl: null,
};

async function actor(): Promise<Actor | DeskResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    redirect("/sign-in");
  }
  const organizationId = session.session.activeOrganizationId;
  if (typeof organizationId !== "string") {
    return { message: "You cannot record that change.", ...emptyFound };
  }
  const platformRole = session.user.platformRole;
  return {
    userId: session.user.id,
    platformRole: typeof platformRole === "string" ? platformRole : "user",
    universityId: organizationId,
  };
}

function isActor(value: Actor | DeskResult): value is Actor {
  return "userId" in value;
}

async function attendant(): Promise<Actor | DeskResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const membership = orm
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, who.universityId), eq(schema.member.userId, who.userId)))
    .get();
  if (membership === undefined || membership.role !== "attendant") {
    return { message: "You cannot record that change.", ...emptyFound };
  }
  return who;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function failureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "The change was not recorded.";
}

function utcDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function refresh(): void {
  revalidatePath("/desk");
  revalidatePath("/school/inventory");
  revalidatePath("/home");
}

export async function checkoutAsset(formData: FormData): Promise<DeskResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const dueText = text(formData, "due").trim();
  const dueAt = dueText.length === 0 ? null : utcDay(dueText);
  if (dueText.length > 0 && dueAt === null) {
    return { message: "The due date is not a date.", ...emptyFound };
  }
  const studentField = text(formData, "student");
  const key = studentField.trim().length === 0 ? text(formData, "email") : studentField;
  const student = findBorrower(orm, who.universityId, key);
  if (student === null) {
    return { message: "The borrower is not a student at this university.", ...emptyFound };
  }
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.checkout({
          actor: who,
          tag: text(formData, "tag"),
          borrowerUserId: student.userId,
          dueAt,
        });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure), ...emptyFound };
  }
  refresh();
  return { message: null, ...emptyFound };
}

export async function previewBorrower(key: string): Promise<BorrowerPreview> {
  const who = await attendant();
  if (!isActor(who)) {
    return deniedPreview;
  }
  const borrower = findBorrower(orm, who.universityId, key);
  if (borrower === null) {
    return unknownBorrower;
  }
  return {
    message: null,
    name: borrower.name,
    officialId: borrower.officialId,
    photoUrl: borrower.photoUrl,
  };
}

export async function checkInAsset(formData: FormData): Promise<DeskResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.checkIn({
          actor: who,
          assetId: text(formData, "assetId"),
          condition: text(formData, "condition"),
        });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure), ...emptyFound };
  }
  refresh();
  return { message: null, ...emptyFound };
}

export async function reportFound(formData: FormData): Promise<DeskResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const note = text(formData, "note");
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.reportFound({
          actor: who,
          tag: text(formData, "tag"),
          note: note.trim().length === 0 ? null : note,
        });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure), ...emptyFound };
  }
  revalidatePath("/desk");
  return {
    message: null,
    foundTitle: result.success.assetTitle,
    foundLocation: result.success.locationName,
  };
}
