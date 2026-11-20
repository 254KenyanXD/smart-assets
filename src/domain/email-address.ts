import { Effect, Schema } from "effect";

const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidEmail extends Schema.TaggedError<InvalidEmail>()("InvalidEmail", {}) {}

export type EmailAddress = string & { readonly EmailAddress: unique symbol };

export function parse(input: string): Effect.Effect<EmailAddress, InvalidEmail> {
  const normalized = input.trim().toLowerCase();
  if (!pattern.test(normalized)) {
    return Effect.fail(new InvalidEmail());
  }
  // SAFETY: the pattern and normalisation above are the only constructors for EmailAddress.
  return Effect.succeed(normalized as EmailAddress);
}

export function parts(email: EmailAddress): { readonly local: string; readonly domain: string } {
  const at = email.lastIndexOf("@");
  return {
    local: email.slice(0, at),
    domain: email.slice(at + 1),
  };
}
