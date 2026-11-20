
export const DEACTIVATE_FORBIDDEN_MESSAGE = "You cannot deactivate that account.";

export const DEACTIVATE_SELF_MESSAGE = "You cannot deactivate your own account.";

export const DEACTIVATE_ROLE_MESSAGE = "A school administrator deactivates department heads and attendants.";

export const DEACTIVATE_OTHER_UNIVERSITY_MESSAGE =
  "A school administrator can deactivate an account only in their own university.";

export const DEACTIVATE_PLATFORM_MESSAGE = "That account is not deactivated from here.";

export const DEACTIVATE_UNKNOWN_MESSAGE = "No account in this university uses that email.";

export const DEACTIVATE_SUSPENDED_MESSAGE = "This university is suspended.";

export const DEACTIVATE_UNKNOWN_UNIVERSITY_MESSAGE = "That university is not supported.";

export const DEACTIVATE_ALREADY_MESSAGE = "That account is already deactivated.";

export const DEACTIVATE_REASON_MESSAGE = "Say why this account is being deactivated.";

export const DEACTIVATE_REASON_LONG_MESSAGE = "The reason is too long.";

const universityRoles = ["school_admin", "dept_head", "attendant", "student"] as const;

export type UniversityRole = (typeof universityRoles)[number];

export type DeactivateActor =
  | { readonly _tag: "super_admin"; readonly userId: string }
  | { readonly _tag: "school_admin"; readonly userId: string; readonly universityId: string };

export interface DeactivateTarget {
  readonly userId: string;

  readonly platformRole: "super_admin" | "user";

  readonly role: UniversityRole;

  readonly universityId: string;
}

export type DeactivateDenial = "forbidden" | "self" | "other-university" | "role" | "platform";

export function parseUniversityRole(input: string): UniversityRole | null {
  for (const role of universityRoles) {
    if (role === input) return role;
  }
  return null;
}

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
