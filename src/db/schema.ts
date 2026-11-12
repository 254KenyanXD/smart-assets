import { relations, sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Platform account. `platformRole` is global. University roles live on `member`.
 */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  platformRole: text("platform_role").notNull().default("user"),
  role: text("role").default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
});

/** Browser session. The active organization is the university for this visit. */
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
  impersonatedBy: text("impersonated_by"),
});

/** Credential or external account. The password column stores a hash, never a portal password. */
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** One-time verification tokens. Staff invite tokens are stored separately, hashed. */
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

/** One organization per university. The id matches `universities.id`. */
export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  metadata: text("metadata"),
});

/** University membership. Role is school_admin, dept_head, attendant, or student. */
export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("member_org_user").on(table.organizationId, table.userId)],
);

/** Organization invitation row used by better-auth. App staff invites are `staffInvites`. */
export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/**
 * A university tenant. `authConfig.adapter` is daystar-portal, local, or oidc.
 * oidc stays disabled until a client is configured.
 */
export const universities = sqliteTable("universities", {
  id: text("id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  country: text("country").notNull(),
  portalUrl: text("portal_url"),
  authConfig: text("auth_config", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
});

/**
 * Email domain that resolves to a university. Exact match, no suffix guessing.
 * One domain can name more than one university, so the page can show a selector.
 */
export const universityDomains = sqliteTable(
  "university_domains",
  {
    domain: text("domain").notNull(),
    universityId: text("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.domain, table.universityId] })],
);

/** Faculty inside one university. */
export const faculties = sqliteTable("faculties", {
  id: text("id").primaryKey(),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
});

/** Department under a faculty. */
export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  facultyId: text("faculty_id")
    .notNull()
    .references(() => faculties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
});

/** A lab, desk, or library counter. */
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id, { onDelete: "cascade" }),
  departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
});

/**
 * Profile returned by an identity adapter.
 * `userId` ties the profile to the local account created at link time.
 */
export const studentProfiles = sqliteTable("student_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id, { onDelete: "cascade" }),
  officialId: text("official_id").notNull(),
  fullName: text("full_name").notNull(),
  programme: text("programme"),
  campus: text("campus"),
  school: text("school"),
  standing: text("standing"),
  email: text("email"),
  photoUrl: text("photo_url"),
  source: text("source").notNull(),
  firstVerifiedAt: integer("first_verified_at", { mode: "timestamp_ms" }).notNull(),
  lastVerifiedAt: integer("last_verified_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Hashed password reset. The raw token is shown once and is not stored.
 * A newer mint revokes the older unused link for the same account.
 */
export const passwordResets = sqliteTable("password_resets", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id, { onDelete: "cascade" }),
  mintedBy: text("minted_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

/** Hashed staff invite. The raw token is shown once and is not stored. */
export const staffInvites = sqliteTable("staff_invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  universityId: text("university_id").references(() => universities.id, { onDelete: "cascade" }),
  departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),
  employeeId: text("employee_id"),
  batchId: text("batch_id"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

/**
 * One tagged asset. The tag is unique inside the university, not across universities.
 * Money columns are integer currency units. Book value is computed on read.
 */
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    tag: text("tag").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    cost: integer("cost").notNull(),
    salvage: integer("salvage").notNull(),
    usefulLifeYears: integer("useful_life_years").notNull(),
    purchasedOn: integer("purchased_on", { mode: "timestamp_ms" }).notNull(),
    lastCondition: text("last_condition"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("assets_university_tag").on(table.universityId, table.tag)],
);

/** One loan. An asset has at most one row with `checked_in_at` still null. */
export const custody = sqliteTable(
  "custody",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    borrowerUserId: text("borrower_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attendantUserId: text("attendant_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    checkedOutAt: integer("checked_out_at", { mode: "timestamp_ms" }).notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" }),
    conditionOnReturn: text("condition_on_return"),
  },
  (table) => [uniqueIndex("custody_one_open_loan").on(table.assetId).where(sql`${table.checkedInAt} is null`)],
);

/**
 * A found-item report. The receipt a finder sees is the tag, the title, and the location.
 * Borrower contact columns do not belong on this table.
 */
export const foundReports = sqliteTable("found_reports", {
  id: text("id").primaryKey(),
  universityId: text("university_id")
    .notNull()
    .references(() => universities.id, { onDelete: "cascade" }),
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  reporterUserId: text("reporter_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Before-and-after record for a destructive or cross-university action. */
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  universityId: text("university_id").references(() => universities.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target").notNull(),
  reason: text("reason"),
  before: text("before", { mode: "json" }),
  after: text("after", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Drizzle relations for the tenancy tables the login flow reads. */
export const universityRelations = relations(universities, ({ many }) => ({
  domains: many(universityDomains),
  profiles: many(studentProfiles),
}));

/** Domain rows pointing at their university. */
export const universityDomainRelations = relations(universityDomains, ({ one }) => ({
  university: one(universities, {
    fields: [universityDomains.universityId],
    references: [universities.id],
  }),
}));
