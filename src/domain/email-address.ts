import { Effect, Schema } from "effect";

const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The email text could not be parsed.
 */
export class InvalidEmail extends Schema.TaggedError<InvalidEmail>()("InvalidEmail", {}) {}

/**
 * A trimmed, lowercased email address.
 */
export type EmailAddress = string & { readonly EmailAddress: unique symbol };

/**
 * Parse an email address from untrusted text.
 *
 * @param input - The raw email field.
 * @returns The normalised address, or `InvalidEmail`.
 */
export function parse(input: string): Effect.Effect<EmailAddress, InvalidEmail> {
  const normalized = input.trim().toLowerCase();
  if (!pattern.test(normalized)) {
    return Effect.fail(new InvalidEmail());
  }
  // SAFETY: the pattern and normalisation above are the only constructors for EmailAddress.
  return Effect.succeed(normalized as EmailAddress);
}

/**
 * Split a parsed email into the local part and the domain.
 *
 * @param email - The parsed address.
 * @returns The local part and the domain after the last `@`.
 */
export function parts(email: EmailAddress): { readonly local: string; readonly domain: string } {
  const at = email.lastIndexOf("@");
  return {
    local: email.slice(0, at),
    domain: email.slice(at + 1),
  };
}
