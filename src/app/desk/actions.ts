"use server";

import { Effect } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { findUniversityStudent } from "@/lib/asset-store";
import { auth, orm, runtime } from "@/lib/auth-server";
import { Service as Custody, type Actor } from "@/services/custody";

/** What a desk form should say. A found receipt never carries a borrower. */
export interface DeskResult {
  /** Error sentence, or null when the write committed. */
  readonly message: string | null;
  /** Title from a found-item receipt, or null when this action was not a find. */
  readonly foundTitle: string | null;
  /** Location from that receipt. Null means no location is recorded, or this was not a find. */
  readonly foundLocation: string | null;
}

const emptyFound: Pick<DeskResult, "foundTitle" | "foundLocation"> = {
  foundTitle: null,
  foundLocation: null,
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

/**
 * Parse a date-only field as UTC midnight.
 *
 * @param value - `YYYY-MM-DD` from a date input.
 */
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

/**
 * Check an asset out to a student email typed at the desk.
 *
 * @param formData - Tag, student email, and an optional due date.
 */
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
  const student = findUniversityStudent(orm, who.universityId, text(formData, "email"));
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

/**
 * Check an open loan back in with a condition grade.
 *
 * @param formData - Asset id and condition key.
 */
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

/**
 * Report a found tag. The result is the title and the location only.
 *
 * @param formData - Tag and an optional note.
 */
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
