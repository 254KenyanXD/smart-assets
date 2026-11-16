import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer, Schema } from "effect";
import type { Database } from "bun:sqlite";

import * as schema from "@/db/schema";
import { decideMove, labelAssetState, parseAssetState, type AssetState } from "@/domain/asset-state";
import { parseCondition, type Condition } from "@/domain/condition";
import { straightLine, type DepreciationRefusal } from "@/domain/depreciation";
import { parseLocationKind, type LocationKind } from "@/domain/location";

type Orm = BunSQLiteDatabase<typeof schema>;
type Tx = Parameters<Parameters<Orm["transaction"]>[0]>[0];

/** Who is asking. The university role is loaded from membership, not from this object. */
export interface Actor {
  /** Account id. */
  readonly userId: string;
  /** `super_admin` or `user` from the account row. */
  readonly platformRole: string;
  /** University the change is about. A super admin names it. Everyone else must belong to it. */
  readonly universityId: string;
}

/** A location row just after it is created. */
export interface CreatedLocation {
  /** Location id. */
  readonly id: string;
  /** Name as stored, trimmed. */
  readonly name: string;
  /** Kind as stored. */
  readonly kind: LocationKind;
}

/** An asset row just after it is registered. It always starts procured. */
export interface RegisteredAsset {
  /** Asset id. */
  readonly id: string;
  /** Tag as stored, trimmed. */
  readonly tag: string;
  /** The only state a new asset is allowed to start in. */
  readonly state: "procured";
}

/** An asset after a move that was allowed. */
export interface AssetSnapshot {
  /** Asset id. */
  readonly id: string;
  /** Tag as stored. */
  readonly tag: string;
  /** State after the committed move. */
  readonly state: AssetState;
}

/** A checkout that committed the loan and the audit together. */
export interface CheckoutReceipt {
  /** Asset that left the shelf. */
  readonly assetId: string;
  /** Custody row id. */
  readonly custodyId: string;
  /** Tag as stored. */
  readonly tag: string;
  /** State after checkout. */
  readonly state: "in_custody";
}

/**
 * What a finder is allowed to see.
 * Borrower email, phone, and portal identity are not on this object.
 */
export interface FoundReceipt {
  /** Tag that was reported. */
  readonly assetTag: string;
  /** Title of that asset. */
  readonly assetTitle: string;
  /** Location name, or null when the asset has none. */
  readonly locationName: string | null;
}

/** The caller is not allowed to make this change. No rejected-move audit is written. */
export class NotAllowed extends Schema.TaggedError<NotAllowed>()("NotAllowed", {
  message: Schema.String,
}) {}

/** The tag or id is not an asset of this university. */
export class UnknownAsset extends Schema.TaggedError<UnknownAsset>()("UnknownAsset", {
  message: Schema.String,
}) {}

/** This university already stored that tag. */
export class DuplicateTag extends Schema.TaggedError<DuplicateTag>()("DuplicateTag", {
  message: Schema.String,
}) {}

/** The move is not on the written list. The rejected audit is already committed. */
export class IllegalMove extends Schema.TaggedError<IllegalMove>()("IllegalMove", {
  message: Schema.String,
}) {}

/** Checkout was asked for someone who is not a student member of this university. */
export class NotAStudent extends Schema.TaggedError<NotAStudent>()("NotAStudent", {
  message: Schema.String,
}) {}

/** Check-in found no open loan. The asset state was left as it was. */
export class NoOpenLoan extends Schema.TaggedError<NoOpenLoan>()("NoOpenLoan", {
  message: Schema.String,
}) {}

/** The university is suspended, so the write was refused. */
export class SuspendedUniversity extends Schema.TaggedError<SuspendedUniversity>()("SuspendedUniversity", {
  message: Schema.String,
}) {}

/** Cost, salvage, or useful life cannot be used in the written formula. */
export class BadMoney extends Schema.TaggedError<BadMoney>()("BadMoney", {
  message: Schema.String,
}) {}

/** A title, tag, date, location, or condition was not usable. */
export class InvalidAsset extends Schema.TaggedError<InvalidAsset>()("InvalidAsset", {
  message: Schema.String,
}) {}

type Outcome<A, E> = { readonly _tag: "ok"; readonly value: A } | { readonly _tag: "err"; readonly error: E };

type RegisterError = NotAllowed | SuspendedUniversity | DuplicateTag | BadMoney | InvalidAsset;
type UpdateError = NotAllowed | SuspendedUniversity | UnknownAsset | DuplicateTag | BadMoney | InvalidAsset;
type LocationError = NotAllowed | SuspendedUniversity | InvalidAsset;
type MoveError = NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove;
type CheckoutError = NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove | NotAStudent | InvalidAsset;
type CheckInError = NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove | NoOpenLoan | InvalidAsset;
type FoundError = NotAllowed | SuspendedUniversity | UnknownAsset | InvalidAsset;
type GateError = NotAllowed | SuspendedUniversity;

type ActorRole = "super_admin" | "school_admin" | "dept_head" | "attendant" | "student";

const recordRoles: readonly ActorRole[] = ["super_admin", "school_admin"];
const foundRoles: readonly ActorRole[] = ["super_admin", "school_admin", "dept_head", "attendant", "student"];

/**
 * Register, move, lend, and return assets.
 * A rejected move and a successful move each commit their audit.
 * A checkout that fails while writing the audit rolls the loan back with it.
 */
export interface Interface {
  /**
   * Register one asset as procured.
   *
   * @param input - Actor, tag, title, money, and purchase date.
   */
  readonly register: (input: {
    readonly actor: Actor;
    readonly tag: string;
    readonly title: string;
    readonly cost: number;
    readonly salvage: number;
    readonly usefulLifeYears: number;
    readonly purchasedOn: Date;
    readonly locationId?: string | null;
  }) => Effect.Effect<RegisteredAsset, NotAllowed | SuspendedUniversity | DuplicateTag | BadMoney | InvalidAsset>;
  /**
   * Correct the recorded details of one asset.
   * State and the last check-in condition stay as they are.
   *
   * @param input - Actor, asset id, and the details a school administrator can edit.
   */
  readonly update: (input: {
    readonly actor: Actor;
    readonly assetId: string;
    readonly tag: string;
    readonly title: string;
    readonly cost: number;
    readonly salvage: number;
    readonly usefulLifeYears: number;
    readonly purchasedOn: Date;
    readonly locationId: string | null;
  }) => Effect.Effect<
    AssetSnapshot,
    NotAllowed | SuspendedUniversity | UnknownAsset | DuplicateTag | BadMoney | InvalidAsset
  >;
  /**
   * Add a lab, a desk, or a library counter in the actor's university.
   * The department is optional. When it is set, it has to belong to that university.
   *
   * @param input - Actor, name, kind, and an optional department id.
   */
  readonly createLocation: (input: {
    readonly actor: Actor;
    readonly name: string;
    readonly kind: string;
    readonly departmentId: string | null;
  }) => Effect.Effect<CreatedLocation, NotAllowed | SuspendedUniversity | InvalidAsset>;
  /**
   * Move an asset along the written list, except checkout and the desk return.
   * Those two stay on checkout and check-in so a loan cannot skip the borrower or the condition.
   *
   * @param input - Actor, asset id, and the state being asked for.
   */
  readonly recordMove: (input: {
    readonly actor: Actor;
    readonly assetId: string;
    readonly to: AssetState;
  }) => Effect.Effect<AssetSnapshot, NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove>;
  /**
   * Check an available asset out to a student.
   *
   * @param input - Actor, tag, borrower, and an optional due instant.
   */
  readonly checkout: (input: {
    readonly actor: Actor;
    readonly tag: string;
    readonly borrowerUserId: string;
    readonly dueAt: Date | null;
  }) => Effect.Effect<
    CheckoutReceipt,
    NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove | NotAStudent | InvalidAsset
  >;
  /**
   * Check an asset back in and record the condition grade.
   *
   * @param input - Actor, asset id, and a condition grade.
   */
  readonly checkIn: (input: {
    readonly actor: Actor;
    readonly assetId: string;
    readonly condition: string;
  }) => Effect.Effect<
    AssetSnapshot,
    NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove | NoOpenLoan | InvalidAsset
  >;
  /**
   * Record that someone found an asset. The receipt has no borrower contact.
   *
   * @param input - Actor, tag, and an optional note stored on the report row only.
   */
  readonly reportFound: (input: {
    readonly actor: Actor;
    readonly tag: string;
    readonly note: string | null;
  }) => Effect.Effect<FoundReceipt, NotAllowed | SuspendedUniversity | UnknownAsset | InvalidAsset>;
}

/**
 * Custody state changes for one university.
 */
export class Service extends Context.Service<Service, Interface>()("@app/Custody") {}

/**
 * Build the custody service over one SQLite database.
 * The layer has no other services, so login can keep its own runtime.
 *
 * @param database - Open bun:sqlite database. The caller owns its lifetime.
 */
export function layer(database: Database): Layer.Layer<Service> {
  const orm = drizzle(database, { schema });

  return Layer.effect(
    Service,
    Effect.sync(() => {
      const register = Effect.fn("Custody.register")(function* (input: {
        readonly actor: Actor;
        readonly tag: string;
        readonly title: string;
        readonly cost: number;
        readonly salvage: number;
        readonly usefulLifeYears: number;
        readonly purchasedOn: Date;
        readonly locationId?: string | null;
      }): Effect.fn.Return<RegisteredAsset, NotAllowed | SuspendedUniversity | DuplicateTag | BadMoney | InvalidAsset> {
        const outcome = yield* Effect.sync(() => registerAsset(orm, input));
        return yield* unwrap<RegisteredAsset, RegisterError>(outcome);
      });

      const update = Effect.fn("Custody.update")(function* (input: {
        readonly actor: Actor;
        readonly assetId: string;
        readonly tag: string;
        readonly title: string;
        readonly cost: number;
        readonly salvage: number;
        readonly usefulLifeYears: number;
        readonly purchasedOn: Date;
        readonly locationId: string | null;
      }): Effect.fn.Return<
        AssetSnapshot,
        NotAllowed | SuspendedUniversity | UnknownAsset | DuplicateTag | BadMoney | InvalidAsset
      > {
        const outcome = yield* Effect.sync(() => updateAsset(orm, input));
        return yield* unwrap<AssetSnapshot, UpdateError>(outcome);
      });

      const createLocation = Effect.fn("Custody.createLocation")(function* (input: {
        readonly actor: Actor;
        readonly name: string;
        readonly kind: string;
        readonly departmentId: string | null;
      }): Effect.fn.Return<CreatedLocation, NotAllowed | SuspendedUniversity | InvalidAsset> {
        const outcome = yield* Effect.sync(() => createLocationRow(orm, input));
        return yield* unwrap<CreatedLocation, LocationError>(outcome);
      });

      const recordMove = Effect.fn("Custody.recordMove")(function* (input: {
        readonly actor: Actor;
        readonly assetId: string;
        readonly to: AssetState;
      }): Effect.fn.Return<AssetSnapshot, NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove> {
        const outcome = yield* Effect.sync(() => moveAsset(orm, input));
        return yield* unwrap<AssetSnapshot, MoveError>(outcome);
      });

      const checkout = Effect.fn("Custody.checkout")(function* (input: {
        readonly actor: Actor;
        readonly tag: string;
        readonly borrowerUserId: string;
        readonly dueAt: Date | null;
      }): Effect.fn.Return<
        CheckoutReceipt,
        NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove | NotAStudent | InvalidAsset
      > {
        const outcome = yield* Effect.sync(() => checkoutAsset(orm, input));
        return yield* unwrap<CheckoutReceipt, CheckoutError>(outcome);
      });

      const checkIn = Effect.fn("Custody.checkIn")(function* (input: {
        readonly actor: Actor;
        readonly assetId: string;
        readonly condition: string;
      }): Effect.fn.Return<
        AssetSnapshot,
        NotAllowed | SuspendedUniversity | UnknownAsset | IllegalMove | NoOpenLoan | InvalidAsset
      > {
        const outcome = yield* Effect.sync(() => checkInAsset(orm, input));
        return yield* unwrap<AssetSnapshot, CheckInError>(outcome);
      });

      const reportFound = Effect.fn("Custody.reportFound")(function* (input: {
        readonly actor: Actor;
        readonly tag: string;
        readonly note: string | null;
      }): Effect.fn.Return<FoundReceipt, NotAllowed | SuspendedUniversity | UnknownAsset | InvalidAsset> {
        const outcome = yield* Effect.sync(() => foundAsset(orm, input));
        return yield* unwrap<FoundReceipt, FoundError>(outcome);
      });

      return Service.of({ register, update, createLocation, recordMove, checkout, checkIn, reportFound });
    }),
  );
}

function unwrap<A, E>(outcome: Outcome<A, E>): Effect.Effect<A, E> {
  if (outcome._tag === "err") {
    return Effect.fail(outcome.error);
  }
  return Effect.succeed(outcome.value);
}

function ok<A>(value: A): Outcome<A, never> {
  return { _tag: "ok", value };
}

function err<E>(error: E): Outcome<never, E> {
  return { _tag: "err", error };
}

function moneyMessage(reason: DepreciationRefusal): string {
  switch (reason) {
    case "cost":
      return "Cost has to be a whole number of currency units, zero or more.";
    case "salvage":
      return "Salvage has to be a whole number of currency units, from zero up to the cost.";
    case "life":
      return "Useful life has to be a whole number of years, at least one.";
    case "age":
      return "Age has to be a whole number of years, zero or more.";
  }
}

function readRole(orm: Orm, actor: Actor): ActorRole | null {
  if (actor.platformRole === "super_admin") {
    return "super_admin";
  }
  const row = orm
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, actor.universityId), eq(schema.member.userId, actor.userId)))
    .get();
  if (row === undefined) {
    return null;
  }
  switch (row.role) {
    case "super_admin":
    case "school_admin":
    case "dept_head":
    case "attendant":
    case "student":
      return row.role;
    default:
      return null;
  }
}

function authorize(orm: Orm, actor: Actor, allowed: readonly ActorRole[]): Outcome<ActorRole, GateError> {
  const university = orm
    .select({ status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, actor.universityId))
    .get();
  if (university === undefined) {
    return err(new NotAllowed({ message: "This university is outside your account." }));
  }
  if (university.status !== "active") {
    return err(new SuspendedUniversity({ message: "This university is suspended." }));
  }
  const role = readRole(orm, actor);
  if (role === null || !allowed.includes(role)) {
    return err(new NotAllowed({ message: "You cannot record that change." }));
  }
  return ok(role);
}

function isDuplicateTagError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE") && error.message.includes("assets");
}

function writeAudit(
  tx: Tx,
  input: {
    readonly actor: Actor;
    readonly action: string;
    readonly target: string;
    readonly before: unknown;
    readonly after: unknown;
  },
): void {
  tx.insert(schema.auditLog)
    .values({
      id: crypto.randomUUID(),
      actorUserId: input.actor.userId,
      universityId: input.actor.universityId,
      action: input.action,
      target: input.target,
      reason: null,
      before: input.before,
      after: input.after,
      createdAt: new Date(),
    })
    .run();
}

function rejectMove(tx: Tx, actor: Actor, assetId: string, from: string, to: AssetState): void {
  writeAudit(tx, {
    actor,
    action: "asset.move.rejected",
    target: assetId,
    before: { state: from },
    after: { state: from, attempted: to },
  });
}

function loadAsset(tx: Tx, universityId: string, assetId: string) {
  return tx
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.universityId, universityId)))
    .get();
}

function loadByTag(tx: Tx, universityId: string, tag: string) {
  return tx
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.universityId, universityId), eq(schema.assets.tag, tag)))
    .get();
}

function openLoan(tx: Tx, assetId: string) {
  return tx
    .select({ id: schema.custody.id })
    .from(schema.custody)
    .where(and(eq(schema.custody.assetId, assetId), isNull(schema.custody.checkedInAt)))
    .get();
}

function createLocationRow(
  orm: Orm,
  input: {
    readonly actor: Actor;
    readonly name: string;
    readonly kind: string;
    readonly departmentId: string | null;
  },
): Outcome<CreatedLocation, LocationError> {
  const gate = authorize(orm, input.actor, recordRoles);
  if (gate._tag === "err") {
    return gate;
  }
  const name = input.name.trim();
  if (name.length === 0) {
    return err(new InvalidAsset({ message: "The location name is required." }));
  }
  if (name.length > 80) {
    return err(new InvalidAsset({ message: "The location name is too long." }));
  }
  const kind = parseLocationKind(input.kind.trim());
  if (kind === null) {
    return err(new InvalidAsset({ message: "Choose a lab, a desk, or a library counter." }));
  }
  const departmentId = input.departmentId === null || input.departmentId.trim().length === 0 ? null : input.departmentId.trim();
  return orm.transaction((tx) => {
    if (departmentId !== null) {
      const department = tx
        .select({ id: schema.departments.id })
        .from(schema.departments)
        .innerJoin(schema.faculties, eq(schema.departments.facultyId, schema.faculties.id))
        .where(and(eq(schema.departments.id, departmentId), eq(schema.faculties.universityId, input.actor.universityId)))
        .get();
      if (department === undefined) {
        return err(new InvalidAsset({ message: "That department is not part of this university." }));
      }
    }
    const id = crypto.randomUUID();
    tx.insert(schema.locations)
      .values({
        id,
        universityId: input.actor.universityId,
        departmentId,
        name,
        kind,
      })
      .run();
    writeAudit(tx, {
      actor: input.actor,
      action: "location.create",
      target: id,
      before: null,
      after: { name, kind, departmentId },
    });
    const created: CreatedLocation = { id, name, kind };
    return ok(created);
  });
}

function registerAsset(
  orm: Orm,
  input: {
    readonly actor: Actor;
    readonly tag: string;
    readonly title: string;
    readonly cost: number;
    readonly salvage: number;
    readonly usefulLifeYears: number;
    readonly purchasedOn: Date;
    readonly locationId?: string | null;
  },
): Outcome<RegisteredAsset, RegisterError> {
  const gate = authorize(orm, input.actor, recordRoles);
  if (gate._tag === "err") {
    return gate;
  }
  const title = input.title.trim();
  const tag = input.tag.trim();
  if (title.length === 0 || tag.length === 0) {
    return err(new InvalidAsset({ message: "The title and the tag are required." }));
  }
  if (title.length > 120 || tag.length > 64) {
    return err(new InvalidAsset({ message: "The title or the tag is too long." }));
  }
  if (Number.isNaN(input.purchasedOn.getTime())) {
    return err(new InvalidAsset({ message: "The purchase date is not a date." }));
  }
  const money = straightLine({
    cost: input.cost,
    salvage: input.salvage,
    usefulLifeYears: input.usefulLifeYears,
    ageYears: 0,
  });
  if (money._tag === "invalid") {
    return err(new BadMoney({ message: moneyMessage(money.reason) }));
  }
  const locationId = input.locationId ?? null;
  try {
    return orm.transaction((tx) => {
      if (locationId !== null) {
        const location = tx
          .select({ id: schema.locations.id })
          .from(schema.locations)
          .where(and(eq(schema.locations.id, locationId), eq(schema.locations.universityId, input.actor.universityId)))
          .get();
        if (location === undefined) {
          return err(new InvalidAsset({ message: "That location is not part of this university." }));
        }
      }
      const existing = loadByTag(tx, input.actor.universityId, tag);
      if (existing !== undefined) {
        return err(new DuplicateTag({ message: "This university already has that tag." }));
      }
      const id = crypto.randomUUID();
      const now = new Date();
      tx.insert(schema.assets)
        .values({
          id,
          universityId: input.actor.universityId,
          locationId,
          tag,
          title,
          state: "procured",
          cost: input.cost,
          salvage: input.salvage,
          usefulLifeYears: input.usefulLifeYears,
          purchasedOn: input.purchasedOn,
          lastCondition: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      writeAudit(tx, {
        actor: input.actor,
        action: "asset.register",
        target: id,
        before: null,
        after: { state: "procured", tag },
      });
      const registered: RegisteredAsset = { id, tag, state: "procured" };
      return ok(registered);
    });
  } catch (error) {
    if (isDuplicateTagError(error)) {
      return err(new DuplicateTag({ message: "This university already has that tag." }));
    }
    throw error;
  }
}

function updateAsset(
  orm: Orm,
  input: {
    readonly actor: Actor;
    readonly assetId: string;
    readonly tag: string;
    readonly title: string;
    readonly cost: number;
    readonly salvage: number;
    readonly usefulLifeYears: number;
    readonly purchasedOn: Date;
    readonly locationId: string | null;
  },
): Outcome<AssetSnapshot, UpdateError> {
  const gate = authorize(orm, input.actor, recordRoles);
  if (gate._tag === "err") {
    return gate;
  }
  const title = input.title.trim();
  const tag = input.tag.trim();
  if (title.length === 0 || tag.length === 0) {
    return err(new InvalidAsset({ message: "The title and the tag are required." }));
  }
  if (title.length > 120 || tag.length > 64) {
    return err(new InvalidAsset({ message: "The title or the tag is too long." }));
  }
  if (Number.isNaN(input.purchasedOn.getTime())) {
    return err(new InvalidAsset({ message: "The purchase date is not a date." }));
  }
  const money = straightLine({
    cost: input.cost,
    salvage: input.salvage,
    usefulLifeYears: input.usefulLifeYears,
    ageYears: 0,
  });
  if (money._tag === "invalid") {
    return err(new BadMoney({ message: moneyMessage(money.reason) }));
  }
  try {
    return orm.transaction((tx) => {
      const asset = loadAsset(tx, input.actor.universityId, input.assetId);
      if (asset === undefined) {
        return err(new UnknownAsset({ message: "That asset is not in this university." }));
      }
      const state = parseAssetState(asset.state);
      if (state === null) {
        return err(new InvalidAsset({ message: "That asset is not in a state this desk can edit." }));
      }
      if (input.locationId !== null) {
        const location = tx
          .select({ id: schema.locations.id })
          .from(schema.locations)
          .where(
            and(eq(schema.locations.id, input.locationId), eq(schema.locations.universityId, input.actor.universityId)),
          )
          .get();
        if (location === undefined) {
          return err(new InvalidAsset({ message: "That location is not part of this university." }));
        }
      }
      const existing = loadByTag(tx, input.actor.universityId, tag);
      if (existing !== undefined && existing.id !== asset.id) {
        return err(new DuplicateTag({ message: "This university already has that tag." }));
      }
      const now = new Date();
      tx.update(schema.assets)
        .set({
          title,
          tag,
          locationId: input.locationId,
          cost: input.cost,
          salvage: input.salvage,
          usefulLifeYears: input.usefulLifeYears,
          purchasedOn: input.purchasedOn,
          updatedAt: now,
        })
        .where(eq(schema.assets.id, asset.id))
        .run();
      writeAudit(tx, {
        actor: input.actor,
        action: "asset.update",
        target: asset.id,
        before: {
          title: asset.title,
          tag: asset.tag,
          locationId: asset.locationId,
          cost: asset.cost,
          salvage: asset.salvage,
          usefulLifeYears: asset.usefulLifeYears,
          purchasedOn: asset.purchasedOn.toISOString(),
          state: asset.state,
          lastCondition: asset.lastCondition,
        },
        after: {
          title,
          tag,
          locationId: input.locationId,
          cost: input.cost,
          salvage: input.salvage,
          usefulLifeYears: input.usefulLifeYears,
          purchasedOn: input.purchasedOn.toISOString(),
          state: asset.state,
          lastCondition: asset.lastCondition,
        },
      });
      return ok({ id: asset.id, tag, state });
    });
  } catch (error) {
    if (isDuplicateTagError(error)) {
      return err(new DuplicateTag({ message: "This university already has that tag." }));
    }
    throw error;
  }
}

function moveAsset(
  orm: Orm,
  input: { readonly actor: Actor; readonly assetId: string; readonly to: AssetState },
): Outcome<AssetSnapshot, MoveError> {
  if (input.to === "in_custody") {
    return err(new NotAllowed({ message: "Checkout is recorded at the desk." }));
  }
  const gate = authorize(orm, input.actor, recordRoles);
  if (gate._tag === "err") {
    return gate;
  }
  return orm.transaction((tx) => {
    const asset = loadAsset(tx, input.actor.universityId, input.assetId);
    if (asset === undefined) {
      return err(new UnknownAsset({ message: "That asset is not in this university." }));
    }
    const from = parseAssetState(asset.state);
    if (from === null) {
      rejectMove(tx, input.actor, asset.id, asset.state, input.to);
      return err(new IllegalMove({ message: "That move is not on the custody list." }));
    }
    if (from === "in_custody" && input.to === "available") {
      return err(new NotAllowed({ message: "A return is recorded at the desk with a condition." }));
    }
    if (openLoan(tx, asset.id) !== undefined && input.to !== "available") {
      rejectMove(tx, input.actor, asset.id, from, input.to);
      return err(new IllegalMove({ message: "That move is not on the custody list." }));
    }
    if (decideMove(from, input.to)._tag === "reject") {
      rejectMove(tx, input.actor, asset.id, from, input.to);
      return err(new IllegalMove({ message: "That move is not on the custody list." }));
    }
    const now = new Date();
    tx.update(schema.assets)
      .set({ state: input.to, updatedAt: now })
      .where(eq(schema.assets.id, asset.id))
      .run();
    writeAudit(tx, {
      actor: input.actor,
      action: "asset.move",
      target: asset.id,
      before: { state: from },
      after: { state: input.to },
    });
    return ok({ id: asset.id, tag: asset.tag, state: input.to });
  });
}

function checkoutAsset(
  orm: Orm,
  input: {
    readonly actor: Actor;
    readonly tag: string;
    readonly borrowerUserId: string;
    readonly dueAt: Date | null;
  },
): Outcome<CheckoutReceipt, CheckoutError> {
  const gate = authorize(orm, input.actor, ["attendant"]);
  if (gate._tag === "err") {
    return gate;
  }
  const tag = input.tag.trim();
  if (tag.length === 0 || tag.length > 64) {
    return err(new InvalidAsset({ message: "The tag is required." }));
  }
  if (input.dueAt !== null && Number.isNaN(input.dueAt.getTime())) {
    return err(new InvalidAsset({ message: "The due date is not a date." }));
  }
  return orm.transaction((tx) => {
    const borrower = tx
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, input.actor.universityId), eq(schema.member.userId, input.borrowerUserId)),
      )
      .get();
    if (borrower === undefined || borrower.role !== "student") {
      return err(new NotAStudent({ message: "The borrower is not a student at this university." }));
    }
    const asset = loadByTag(tx, input.actor.universityId, tag);
    if (asset === undefined) {
      return err(new UnknownAsset({ message: "No asset with that tag is in this university." }));
    }
    const from = parseAssetState(asset.state);
    if (from === null || decideMove(from, "in_custody")._tag === "reject" || openLoan(tx, asset.id) !== undefined) {
      rejectMove(tx, input.actor, asset.id, from ?? asset.state, "in_custody");
      if (from !== null && from !== "available" && from !== "in_custody") {
        return err(
          new IllegalMove({
            message: `This asset is ${labelAssetState(from)}. A school administrator has to mark it available before checkout.`,
          }),
        );
      }
      return err(new IllegalMove({ message: "That move is not on the custody list." }));
    }
    const now = new Date();
    const custodyId = crypto.randomUUID();
    tx.update(schema.assets).set({ state: "in_custody", updatedAt: now }).where(eq(schema.assets.id, asset.id)).run();
    tx.insert(schema.custody)
      .values({
        id: custodyId,
        universityId: input.actor.universityId,
        assetId: asset.id,
        borrowerUserId: input.borrowerUserId,
        attendantUserId: input.actor.userId,
        checkedOutAt: now,
        dueAt: input.dueAt,
        checkedInAt: null,
        conditionOnReturn: null,
      })
      .run();
    writeAudit(tx, {
      actor: input.actor,
      action: "asset.move",
      target: asset.id,
      before: { state: from },
      after: { state: "in_custody", custodyId },
    });
    return ok({ assetId: asset.id, custodyId, tag: asset.tag, state: "in_custody" });
  });
}

function checkInAsset(
  orm: Orm,
  input: { readonly actor: Actor; readonly assetId: string; readonly condition: string },
): Outcome<AssetSnapshot, CheckInError> {
  const gate = authorize(orm, input.actor, ["attendant"]);
  if (gate._tag === "err") {
    return gate;
  }
  const condition: Condition | null = parseCondition(input.condition);
  if (condition === null) {
    return err(new InvalidAsset({ message: "Choose Good, Minor wear, or Damaged." }));
  }
  return orm.transaction((tx) => {
    const asset = loadAsset(tx, input.actor.universityId, input.assetId);
    if (asset === undefined) {
      return err(new UnknownAsset({ message: "That asset is not in this university." }));
    }
    const from = parseAssetState(asset.state);
    if (from === null || decideMove(from, "available")._tag === "reject") {
      rejectMove(tx, input.actor, asset.id, from ?? asset.state, "available");
      return err(new IllegalMove({ message: "That move is not on the custody list." }));
    }
    const loan = openLoan(tx, asset.id);
    if (loan === undefined) {
      rejectMove(tx, input.actor, asset.id, from, "available");
      return err(new NoOpenLoan({ message: "There is no open loan for this asset." }));
    }
    const now = new Date();
    tx.update(schema.assets)
      .set({ state: "available", lastCondition: condition, updatedAt: now })
      .where(eq(schema.assets.id, asset.id))
      .run();
    tx.update(schema.custody)
      .set({ checkedInAt: now, conditionOnReturn: condition })
      .where(eq(schema.custody.id, loan.id))
      .run();
    writeAudit(tx, {
      actor: input.actor,
      action: "asset.move",
      target: asset.id,
      before: { state: from },
      after: { state: "available", custodyId: loan.id, condition },
    });
    return ok({ id: asset.id, tag: asset.tag, state: "available" });
  });
}

function foundAsset(
  orm: Orm,
  input: { readonly actor: Actor; readonly tag: string; readonly note: string | null },
): Outcome<FoundReceipt, FoundError> {
  const gate = authorize(orm, input.actor, foundRoles);
  if (gate._tag === "err") {
    return gate;
  }
  const tag = input.tag.trim();
  if (tag.length === 0 || tag.length > 64) {
    return err(new InvalidAsset({ message: "The tag is required." }));
  }
  const note = input.note === null ? null : input.note.trim();
  return orm.transaction((tx) => {
    const asset = tx
      .select({
        id: schema.assets.id,
        tag: schema.assets.tag,
        title: schema.assets.title,
        locationName: schema.locations.name,
      })
      .from(schema.assets)
      .leftJoin(schema.locations, eq(schema.assets.locationId, schema.locations.id))
      .where(and(eq(schema.assets.universityId, input.actor.universityId), eq(schema.assets.tag, tag)))
      .get();
    if (asset === undefined) {
      return err(new UnknownAsset({ message: "No asset with that tag is in this university." }));
    }
    const now = new Date();
    tx.insert(schema.foundReports)
      .values({
        id: crypto.randomUUID(),
        universityId: input.actor.universityId,
        assetId: asset.id,
        reporterUserId: input.actor.userId,
        note: note === null || note.length === 0 ? null : note,
        createdAt: now,
      })
      .run();
    writeAudit(tx, {
      actor: input.actor,
      action: "asset.found",
      target: asset.id,
      before: null,
      after: { tag: asset.tag, locationName: asset.locationName },
    });
    return ok({
      assetTag: asset.tag,
      assetTitle: asset.title,
      locationName: asset.locationName,
    });
  });
}
