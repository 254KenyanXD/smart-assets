import { Schema } from "effect";

/**
 * The portal rejected the username or password.
 * The password is never a field on this error.
 */
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  "InvalidCredentials",
  {
    message: Schema.String,
  },
) {}

/**
 * The portal did not answer in time, or it returned a server error.
 */
export class PortalUnavailable extends Schema.TaggedError<PortalUnavailable>()(
  "PortalUnavailable",
  {
    message: Schema.String,
  },
) {}

/**
 * Login succeeded but the dashboard no longer matches the profile contract.
 */
export class PortalChanged extends Schema.TaggedError<PortalChanged>()("PortalChanged", {
  message: Schema.String,
}) {}

/**
 * The portal accepted the login, and the student is not eligible to borrow.
 */
export class NotEligible extends Schema.TaggedError<NotEligible>()("NotEligible", {
  message: Schema.String,
}) {}

/**
 * Failures an identity adapter is allowed to return.
 */
export type IdentityFailure = InvalidCredentials | PortalUnavailable | PortalChanged | NotEligible;
