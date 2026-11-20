
export const RESET_LIFETIME_MS = 72 * 60 * 60 * 1000;

export const RESET_TOKEN_BYTES = 32;

export const RESET_INVALID_MESSAGE = "This reset link is not valid.";

export const RESET_FORBIDDEN_MESSAGE = "You cannot reset that password.";

export const RESET_OTHER_UNIVERSITY_MESSAGE =
  "A school administrator can reset a password only in their own university.";

export const RESET_ROLE_MESSAGE = "A school administrator resets department heads, attendants, and students.";

export const RESET_PLATFORM_MESSAGE = "That account is not reset from here.";

export const RESET_UNKNOWN_MESSAGE = "No account in this university uses that email.";

export const RESET_NO_PASSWORD_MESSAGE = "That account has no local password yet.";

export const RESET_SUSPENDED_MESSAGE = "This university is suspended.";

export const RESET_UNKNOWN_UNIVERSITY_MESSAGE = "That university is not supported.";

const universityRoles = ["school_admin", "dept_head", "attendant", "student"] as const;

export type UniversityRole = (typeof universityRoles)[number];

export type ResetActor =
  | { readonly _tag: "super_admin" }
  | { readonly _tag: "school_admin"; readonly universityId: string };

export interface ResetTarget {
  readonly platformRole: "super_admin" | "user";

  readonly role: UniversityRole;

  readonly universityId: string;
}

export type ResetDenial = "forbidden" | "other-university" | "role" | "platform";

export function parseUniversityRole(input: string): UniversityRole | null {
  for (const role of universityRoles) {
    if (role === input) return role;
  }
  return null;
}

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

export function hashResetToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

export function resetExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESET_LIFETIME_MS);
}

export function resetStillOpen(
  row: { readonly usedAt: Date | null; readonly revokedAt: Date | null; readonly expiresAt: Date },
  now: Date,
): boolean {
  if (row.usedAt !== null || row.revokedAt !== null) return false;
  return row.expiresAt.getTime() > now.getTime();
}
