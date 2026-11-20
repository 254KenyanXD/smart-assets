import { Schema } from "effect";

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

export interface VerifiedIdentity extends Schema.Schema.Type<typeof VerifiedIdentity> {}
