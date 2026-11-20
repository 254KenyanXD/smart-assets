import { Schema } from "effect";

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  "InvalidCredentials",
  {
    message: Schema.String,
  },
) {}

export class PortalUnavailable extends Schema.TaggedError<PortalUnavailable>()(
  "PortalUnavailable",
  {
    message: Schema.String,
  },
) {}

export class PortalChanged extends Schema.TaggedError<PortalChanged>()("PortalChanged", {
  message: Schema.String,
}) {}

export class NotEligible extends Schema.TaggedError<NotEligible>()("NotEligible", {
  message: Schema.String,
}) {}

export type IdentityFailure = InvalidCredentials | PortalUnavailable | PortalChanged | NotEligible;
