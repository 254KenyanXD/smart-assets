/** How long a password reset link stays usable. */
export const RESET_LIFETIME_MS = 72 * 60 * 60 * 1000;

/** Random bytes in one reset token. Only the SHA-256 of the token is stored. */
export const RESET_TOKEN_BYTES = 32;

/**
 * Shown for an expired, revoked, used, or unknown reset link.
 * Callers must not swap this for a more specific reason.
 */
export const RESET_INVALID_MESSAGE = "This reset link is not valid.";

/** Shown when the session may not mint a reset at all. */
export const RESET_FORBIDDEN_MESSAGE = "You cannot reset that password.";

/** Shown when a school administrator names another university. */
export const RESET_OTHER_UNIVERSITY_MESSAGE =
  "A school administrator can reset a password only in their own university.";

/** Shown when a school administrator targets another school administrator. */
export const RESET_ROLE_MESSAGE = "A school administrator resets department heads, attendants, and students.";

/** Shown when the target is a platform administrator. */
export const RESET_PLATFORM_MESSAGE = "That account is not reset from here.";

/** Shown when the email is not a member of the named university. */
export const RESET_UNKNOWN_MESSAGE = "No account in this university uses that email.";

/** Shown when the account has never set a local password. */
export const RESET_NO_PASSWORD_MESSAGE = "That account has no local password yet.";

/** Shown when the university cannot accept a reset. */
export const RESET_SUSPENDED_MESSAGE = "This university is suspended.";

/** Shown when the university id is not one this deployment has. */
export const RESET_UNKNOWN_UNIVERSITY_MESSAGE = "That university is not supported.";

const universityRoles = ["school_admin", "dept_head", "attendant", "student"] as const;

/** A role stored on a university membership. */
export type UniversityRole = (typeof universityRoles)[number];

/**
 * Who is asking to mint a reset.
 * A super admin is global. A school administrator is bound to one university.
 */
export type ResetActor =
  | { readonly _tag: "super_admin" }
  | { readonly _tag: "school_admin"; readonly universityId: string };

/** The account the reset would change. */
export interface ResetTarget {
  /** Platform role. A super admin is not reset from this desk. */
  readonly platformRole: "super_admin" | "user";
  /** Membership role in the university the actor named. */
  readonly role: UniversityRole;
  /** University of that membership. */
  readonly universityId: string;
}

/** Why a reset was refused. */
export type ResetDenial = "forbidden" | "other-university" | "role" | "platform";

/**
 * Read a membership role from a stored string.
 *
 * @param input - The role column.
 * @returns The role, or null when it is not one of the four.
 */
export function parseUniversityRole(input: string): UniversityRole | null {
  for (const role of universityRoles) {
    if (role === input) return role;
  }
  return null;
}

/**
 * Decide whether this actor may reset this account.
 *
 * @param actor - The signed-in administrator.
 * @param target - The account in one university.
 * @returns Allow, or the reason to refuse.
 */
export function decideReset(
  actor: ResetActor,
  target: ResetTarget,
): { readonly _tag: "allow" } | { readonly _tag: "deny"; readonly reason: ResetDenial } {
  if (target.platformRole === "super_admin") {
    return { _tag: "deny", reason: "platform" };
  }
  if (actor._tag === "super_admin") {
    return { _tag: "allow" };
  }
  if (target.universityId !== actor.universityId) {
    return { _tag: "deny", reason: "other-university" };
  }
  if (target.role === "school_admin") {
    return { _tag: "deny", reason: "role" };
  }
  return { _tag: "allow" };
}

/**
 * Sentence for a refused reset.
 *
 * @param reason - The denial, or a lookup failure.
 * @returns The sentence shown to the administrator.
 */
export function resetFailureMessage(
  reason: ResetDenial | "unknown" | "no-password" | "suspended" | "unknown-university",
): string {
  switch (reason) {
    case "forbidden":
      return RESET_FORBIDDEN_MESSAGE;
    case "other-university":
      return RESET_OTHER_UNIVERSITY_MESSAGE;
    case "role":
      return RESET_ROLE_MESSAGE;
    case "platform":
      return RESET_PLATFORM_MESSAGE;
    case "unknown":
      return RESET_UNKNOWN_MESSAGE;
    case "no-password":
      return RESET_NO_PASSWORD_MESSAGE;
    case "suspended":
      return RESET_SUSPENDED_MESSAGE;
    case "unknown-university":
      return RESET_UNKNOWN_UNIVERSITY_MESSAGE;
  }
}

/**
 * Hash a reset token for storage and lookup.
 *
 * @param token - The raw token from the link. This string is not stored.
 * @returns The hex SHA-256 of the token.
 */
export function hashResetToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/**
 * When a reset minted at `now` stops working.
 *
 * @param now - The clock reading at mint time.
 * @returns The expiry instant, 72 hours later.
 */
export function resetExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESET_LIFETIME_MS);
}

/**
 * Whether a stored reset can still be used.
 *
 * @param row - The columns that close a link.
 * @param now - The clock reading.
 * @returns True while the link is unused, not revoked, and inside its window.
 */
export function resetStillOpen(
  row: { readonly usedAt: Date | null; readonly revokedAt: Date | null; readonly expiresAt: Date },
  now: Date,
): boolean {
  if (row.usedAt !== null || row.revokedAt !== null) return false;
  return row.expiresAt.getTime() > now.getTime();
}
