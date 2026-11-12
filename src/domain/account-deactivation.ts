/** Shown when the session may not deactivate an account at all. */
export const DEACTIVATE_FORBIDDEN_MESSAGE = "You cannot deactivate that account.";

/** Shown when the signed-in person names their own account. */
export const DEACTIVATE_SELF_MESSAGE = "You cannot deactivate your own account.";

/** Shown when a school administrator names someone who is not staff they run. */
export const DEACTIVATE_ROLE_MESSAGE = "A school administrator deactivates department heads and attendants.";

/** Shown when a school administrator names another university. */
export const DEACTIVATE_OTHER_UNIVERSITY_MESSAGE =
  "A school administrator can deactivate an account only in their own university.";

/** Shown when a school administrator names a platform account. */
export const DEACTIVATE_PLATFORM_MESSAGE = "That account is not deactivated from here.";

/** Shown when the email is not a member of the named university. */
export const DEACTIVATE_UNKNOWN_MESSAGE = "No account in this university uses that email.";

/** Shown when the university cannot accept a deactivation. */
export const DEACTIVATE_SUSPENDED_MESSAGE = "This university is suspended.";

/** Shown when the university id is not one this deployment has. */
export const DEACTIVATE_UNKNOWN_UNIVERSITY_MESSAGE = "That university is not supported.";

/** Shown when the account is already banned. */
export const DEACTIVATE_ALREADY_MESSAGE = "That account is already deactivated.";

/** Shown when the reason is blank. */
export const DEACTIVATE_REASON_MESSAGE = "Say why this account is being deactivated.";

/** Shown when the reason is longer than the audit row should carry. */
export const DEACTIVATE_REASON_LONG_MESSAGE = "The reason is too long.";

const universityRoles = ["school_admin", "dept_head", "attendant", "student"] as const;

/** A role stored on a university membership. */
export type UniversityRole = (typeof universityRoles)[number];

/**
 * Who is asking to deactivate an account.
 * A super admin is global. A school administrator is bound to one university.
 */
export type DeactivateActor =
  | { readonly _tag: "super_admin"; readonly userId: string }
  | { readonly _tag: "school_admin"; readonly userId: string; readonly universityId: string };

/** The account the deactivation would close. */
export interface DeactivateTarget {
  /** Local account id. */
  readonly userId: string;
  /** Platform role. A school administrator cannot close a platform account. */
  readonly platformRole: "super_admin" | "user";
  /** Membership role in the university the actor named. */
  readonly role: UniversityRole;
  /** University of that membership. */
  readonly universityId: string;
}

/** Why a deactivation was refused. */
export type DeactivateDenial = "forbidden" | "self" | "other-university" | "role" | "platform";

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
 * Decide whether this actor may deactivate this account.
 * A platform administrator may close any account except their own.
 * A school administrator may close department heads and attendants in their own university.
 *
 * @param actor - The signed-in administrator.
 * @param target - The account in one university.
 * @returns Allow, or the reason to refuse.
 */
export function decideDeactivate(
  actor: DeactivateActor,
  target: DeactivateTarget,
): { readonly _tag: "allow" } | { readonly _tag: "deny"; readonly reason: DeactivateDenial } {
  if (actor.userId === target.userId) {
    return { _tag: "deny", reason: "self" };
  }
  if (actor._tag === "super_admin") {
    return { _tag: "allow" };
  }
  if (target.platformRole === "super_admin") {
    return { _tag: "deny", reason: "platform" };
  }
  if (target.universityId !== actor.universityId) {
    return { _tag: "deny", reason: "other-university" };
  }
  if (target.role !== "dept_head" && target.role !== "attendant") {
    return { _tag: "deny", reason: "role" };
  }
  return { _tag: "allow" };
}

/**
 * Sentence for a refused deactivation.
 *
 * @param reason - The denial, or a lookup failure.
 * @returns The sentence shown to the administrator.
 */
export function deactivateFailureMessage(
  reason:
    | DeactivateDenial
    | "unknown"
    | "suspended"
    | "unknown-university"
    | "already"
    | "reason"
    | "reason-long",
): string {
  switch (reason) {
    case "forbidden":
      return DEACTIVATE_FORBIDDEN_MESSAGE;
    case "self":
      return DEACTIVATE_SELF_MESSAGE;
    case "other-university":
      return DEACTIVATE_OTHER_UNIVERSITY_MESSAGE;
    case "role":
      return DEACTIVATE_ROLE_MESSAGE;
    case "platform":
      return DEACTIVATE_PLATFORM_MESSAGE;
    case "unknown":
      return DEACTIVATE_UNKNOWN_MESSAGE;
    case "suspended":
      return DEACTIVATE_SUSPENDED_MESSAGE;
    case "unknown-university":
      return DEACTIVATE_UNKNOWN_UNIVERSITY_MESSAGE;
    case "already":
      return DEACTIVATE_ALREADY_MESSAGE;
    case "reason":
      return DEACTIVATE_REASON_MESSAGE;
    case "reason-long":
      return DEACTIVATE_REASON_LONG_MESSAGE;
  }
}
