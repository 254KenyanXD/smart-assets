
export const INVITE_LIFETIME_MS = 72 * 60 * 60 * 1000;

export const INVITE_TOKEN_BYTES = 32;

export const INVITE_INVALID_MESSAGE = "This invite link is not valid.";

export const INVITE_OTHER_UNIVERSITY_MESSAGE =
  "A school administrator can invite only into their own university.";

export const INVITE_ROLE_MESSAGE = "A school administrator invites department heads and attendants.";

export const INVITE_FORBIDDEN_MESSAGE = "You cannot invite staff.";

const staffRoles = ["school_admin", "dept_head", "attendant"] as const;

export type StaffRole = (typeof staffRoles)[number];

export function parseStaffRole(input: string): StaffRole | null {
  for (const role of staffRoles) {
    if (role === input) {
      return role;
    }
  }
  return null;
}

export function labelStaffRole(role: StaffRole): string {
  switch (role) {
    case "school_admin":
      return "School administrator";
    case "dept_head":
      return "Department head";
    case "attendant":
      return "Attendant";
  }
}

export function tableStaffRole(role: StaffRole): string {
  switch (role) {
    case "school_admin":
      return "School admin";
    case "dept_head":
      return "Dept head";
    case "attendant":
      return "Attendant";
  }
}

export type InviteActor =
  | { readonly _tag: "super_admin" }
  | { readonly _tag: "school_admin"; readonly universityId: string };

export type InviteDenial = "forbidden" | "other-university" | "role";

export function decideInvite(
  actor: InviteActor,
  role: StaffRole,
  universityId: string,
): { readonly _tag: "allow" } | { readonly _tag: "deny"; readonly reason: InviteDenial } {
  if (actor._tag === "super_admin") {
    return { _tag: "allow" };
  }
  if (universityId !== actor.universityId) {
    return { _tag: "deny", reason: "other-university" };
  }
  if (role === "school_admin") {
    return { _tag: "deny", reason: "role" };
  }
  return { _tag: "allow" };
}

export function hashInviteToken(token: string): string {
  const digest = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  return digest;
}

export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_LIFETIME_MS);
}

export interface InviteLifetime {
  readonly acceptedAt: Date | null;

  readonly revokedAt: Date | null;

  readonly expiresAt: Date;
}

export function inviteLifetimeState(invite: InviteLifetime, now: Date): "pending" | "used" | "revoked" | "expired" {
  if (invite.acceptedAt !== null) {
    return "used";
  }
  if (invite.revokedAt !== null) {
    return "revoked";
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "pending";
}
