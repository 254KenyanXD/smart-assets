import { Schema } from "effect";

/**
 * What an identity adapter returns after a portal check.
 * The portal password is not part of this value.
 */
export const VerifiedIdentity = Schema.Struct({
  officialId: Schema.String,
  fullName: Schema.String,
  programme: Schema.NullOr(Schema.String),
  campus: Schema.NullOr(Schema.String),
  school: Schema.NullOr(Schema.String),
  standing: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  photoUrl: Schema.NullOr(Schema.String),
  source: Schema.Literal("daystar-portal"),
});

/**
 * A verified student identity.
 */
export interface VerifiedIdentity extends Schema.Schema.Type<typeof VerifiedIdentity> {}
