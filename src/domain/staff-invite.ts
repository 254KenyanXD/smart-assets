/** How long a staff invite stays usable. */
export const INVITE_LIFETIME_MS = 72 * 60 * 60 * 1000;

/** Random bytes in one invite token. Only the SHA-256 of the token is stored. */
export const INVITE_TOKEN_BYTES = 32;

/**
 * Shown for an expired, revoked, used, or unknown invite.
 * Callers must not swap this for a more specific reason.
 */
export const INVITE_INVALID_MESSAGE = "This invite link is not valid.";

/** Shown when a school administrator targets a university that is not theirs. */
export const INVITE_OTHER_UNIVERSITY_MESSAGE =
  "A school administrator can invite only into their own university.";

/** Shown when a school administrator tries to grant a school administrator role. */
export const INVITE_ROLE_MESSAGE = "A school administrator invites department heads and attendants.";

/** Shown when the session may not invite staff at all. */
export const INVITE_FORBIDDEN_MESSAGE = "You cannot invite staff.";

const staffRoles = ["school_admin", "dept_head", "attendant"] as const;

/** A university role that can be granted by an invite. Students are not in this list. */
export type StaffRole = (typeof staffRoles)[number];

/**
 * Read a staff role from untrusted input.
 *
 * @param input - The role string from a form or a stored row.
 * @returns The role, or null when it is not a staff invite role.
 */
export function parseStaffRole(input: string): StaffRole | null {
  for (const role of staffRoles) {
    if (role === input) {
      return role;
    }
  }
  return null;
}

/**
 * Label a staff role for a page.
 *
 * @param role - A parsed staff role.
 * @returns The words shown next to the invite.
 */
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

/**
 * Short table label for a staff role.
 *
 * @param role - A parsed staff role.
 * @returns The words shown in a staff table.
 */
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

/**
 * Who is asking to mint a staff invite.
 * A super admin is global. A school administrator is bound to one university.
 */
export type InviteActor =
  | { readonly _tag: "super_admin" }
  | { readonly _tag: "school_admin"; readonly universityId: string };

/** Why an actor may not mint the invite they asked for. */
export type InviteDenial = "forbidden" | "other-university" | "role";

/**
 * Decide whether an actor may invite one role into one university.
 *
 * A school administrator is checked against the university first, so a request
 * that breaks both rules reports the other university rather than the role.
 *
 * @param actor - The signed-in actor, resolved from the session.
 * @param role - The role the invite would grant.
 * @param universityId - The university the invite would join.
 * @returns Allow, or the reason it is refused.
 */
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

/**
 * Hash an invite token for storage and lookup.
 *
 * @param token - The raw token from the link. This string is not stored.
 * @returns The hex SHA-256 of the token.
 */
export function hashInviteToken(token: string): string {
  const digest = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  return digest;
}

/**
 * When an invite minted at `now` stops working.
 *
 * @param now - The clock reading at mint time.
 * @returns The expiry instant, 72 hours later.
 */
export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_LIFETIME_MS);
}

/** The stored invite columns that decide whether a link can still be used. */
export interface InviteLifetime {
  /** Set when the password was accepted. */
  readonly acceptedAt: Date | null;
  /** Set when an admin withdrew the invite. */
  readonly revokedAt: Date | null;
  /** The instant the link stops working. */
  readonly expiresAt: Date;
}

/**
 * Decide whether a stored invite can still be accepted.
 *
 * @param invite - The stored lifetime columns.
 * @param now - The clock reading for this check.
 * @returns Pending, or the reason it cannot be used. Callers show one message for every non-pending result.
 */
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
