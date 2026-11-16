"use server";

import { Effect } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { parseAssetState } from "@/domain/asset-state";
import { auth, runtime } from "@/lib/auth-server";
import { Service as Custody, type Actor } from "@/services/custody";

/** What a form should say after a write. Null means the table can refresh with no extra sentence. */
export interface ActionResult {
  /** Error sentence, or null when the write committed. */
  readonly message: string | null;
}

async function actor(): Promise<Actor | ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    redirect("/sign-in");
  }
  const organizationId = session.session.activeOrganizationId;
  if (typeof organizationId !== "string") {
    return { message: "You cannot record that change." };
  }
  const platformRole = session.user.platformRole;
  return {
    userId: session.user.id,
    platformRole: typeof platformRole === "string" ? platformRole : "user",
    universityId: organizationId,
  };
}

function isActor(value: Actor | ActionResult): value is Actor {
  return "userId" in value;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function whole(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const number = Number(trimmed);
  return Number.isSafeInteger(number) ? number : null;
}

/**
 * Parse a date-only field as UTC midnight.
 *
 * @param value - `YYYY-MM-DD` from a date input.
 * @returns The instant, or null when the text is not that calendar day.
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

function failureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "The change was not recorded.";
}

/**
 * Register one asset as procured. The university comes from the session.
 *
 * @param formData - Title, tag, cost, salvage, useful life, and purchase date.
 */
export async function registerAsset(formData: FormData): Promise<ActionResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const cost = whole(text(formData, "cost"));
  const salvage = whole(text(formData, "salvage"));
  const usefulLifeYears = whole(text(formData, "usefulLifeYears"));
  if (cost === null || salvage === null || usefulLifeYears === null) {
    return { message: "Cost, salvage, and useful life have to be whole numbers." };
  }
  const purchasedOn = utcDay(text(formData, "purchasedOn"));
  if (purchasedOn === null) {
    return { message: "The purchase date is not a date." };
  }
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        const locationId = text(formData, "locationId").trim();
        return yield* custody.register({
          actor: who,
          title: text(formData, "title"),
          tag: text(formData, "tag"),
          cost,
          salvage,
          usefulLifeYears,
          purchasedOn,
          locationId: locationId.length === 0 ? null : locationId,
        });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure) };
  }
  revalidatePath("/school/inventory");
  return { message: null };
}

/**
 * Correct one asset's recorded details. State and condition stay as they are.
 *
 * @param formData - Asset id, title, tag, money, purchase date, and location.
 */
export async function updateAsset(formData: FormData): Promise<ActionResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const cost = whole(text(formData, "cost"));
  const salvage = whole(text(formData, "salvage"));
  const usefulLifeYears = whole(text(formData, "usefulLifeYears"));
  if (cost === null || salvage === null || usefulLifeYears === null) {
    return { message: "Cost, salvage, and useful life have to be whole numbers." };
  }
  const purchasedOn = utcDay(text(formData, "purchasedOn"));
  if (purchasedOn === null) {
    return { message: "The purchase date is not a date." };
  }
  const locationId = text(formData, "locationId").trim();
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.update({
          actor: who,
          assetId: text(formData, "assetId"),
          title: text(formData, "title"),
          tag: text(formData, "tag"),
          cost,
          salvage,
          usefulLifeYears,
          purchasedOn,
          locationId: locationId.length === 0 ? null : locationId,
        });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure) };
  }
  revalidatePath("/school/inventory");
  revalidatePath("/desk");
  return { message: null };
}

/**
 * Add a lab, a desk, or a library counter in the signed-in university.
 *
 * @param formData - Name, kind, and an optional department id.
 */
export async function createLocation(formData: FormData): Promise<ActionResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const departmentId = text(formData, "departmentId").trim();
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.createLocation({
          actor: who,
          name: text(formData, "name"),
          kind: text(formData, "kind"),
          departmentId: departmentId.length === 0 ? null : departmentId,
        });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure) };
  }
  revalidatePath("/school/inventory");
  return { message: null };
}

/**
 * Move an asset along the record-keeping list. Checkout stays on the attendant desk.
 *
 * @param formData - Asset id and the target state.
 */
export async function recordMove(formData: FormData): Promise<ActionResult> {
  const who = await actor();
  if (!isActor(who)) {
    return who;
  }
  const to = parseAssetState(text(formData, "to"));
  if (to === null) {
    return { message: "That move is not on the custody list." };
  }
  const result = await runtime.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.recordMove({ actor: who, assetId: text(formData, "assetId"), to });
      }),
    ),
  );
  if (result._tag === "Failure") {
    return { message: failureMessage(result.failure) };
  }
  revalidatePath("/school/inventory");
  revalidatePath("/desk");
  return { message: null };
}
