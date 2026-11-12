import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { CookieJar } from "tough-cookie";

import { InvalidCredentials, PortalUnavailable } from "@/lib/identity/errors";

const timeoutMs = 10_000;

const LoginResponse = Schema.Struct({
  success: Schema.optionalKey(Schema.Boolean),
  message: Schema.optionalKey(Schema.String),
});

/**
 * A portal session cookie header captured from the login response.
 */
export interface PortalSession {
  /** Cookie header to send on the next portal request. */
  readonly cookieHeader: string;
}

/**
 * HTTP calls the Daystar adapter is allowed to make.
 * The password is redacted and is not written to a log.
 */
export interface Interface {
  /**
   * Sign in to the student portal.
   *
   * @param input - Base URL, admission number, redacted password, and which JSON body to send.
   */
  readonly login: (input: {
    readonly baseUrl: string;
    readonly username: string;
    readonly password: Redacted.Redacted<string>;
    readonly body: "nested" | "flat";
  }) => Effect.Effect<PortalSession, InvalidCredentials | PortalUnavailable>;
  /**
   * Fetch the dashboard HTML with the session cookies.
   *
   * @param input - Portal base URL and the cookie header from login.
   */
  readonly dashboard: (input: {
    readonly baseUrl: string;
    readonly cookieHeader: string;
  }) => Effect.Effect<string, PortalUnavailable>;
}

/**
 * Daystar portal HTTP transport.
 */
export class Service extends Context.Service<Service, Interface>()("@app/PortalTransport") {}

/**
 * Live transport. Cookies are taken from `Set-Cookie` by hand.
 * The nested login body is the browser shape. `flat` is kept for the probe and is not the default.
 */
export const layer = Layer.sync(Service, () =>
  Service.of({
    login: Effect.fn("PortalTransport.login")(function* (input) {
      const url = new URL("/Login/LoginUser", input.baseUrl).toString();
      const password = Redacted.value(input.password);
      const payload =
        input.body === "flat"
          ? { Username: input.username, Password: password }
          : { userlogin: { Username: input.username, Password: password } };
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(url, {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json; charset = utf-8",
              "X-Requested-With": "XMLHttpRequest",
              Accept: "application/json, text/javascript, */*; q=0.01",
              Origin: input.baseUrl,
              Referer: input.baseUrl,
            },
            body: JSON.stringify(payload),
            redirect: "manual",
          }),
        catch: () =>
          new PortalUnavailable({
            message: "The university portal did not respond.",
          }),
      }).pipe(Effect.timeout(timeoutMs), Effect.catchTag("TimeoutError", () => Effect.fail(
        new PortalUnavailable({ message: "The university portal took too long to answer." }),
      )));
      if (response.status >= 500 || response.status === 0) {
        return yield* new PortalUnavailable({
          message: "The university portal is unavailable.",
        });
      }
      const json: unknown = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () =>
          new PortalUnavailable({
            message: "The university portal returned a page instead of a login result.",
          }),
      });
      const parsed = yield* Schema.decodeUnknownEffect(LoginResponse)(json).pipe(
        Effect.mapError(
          () =>
            new PortalUnavailable({
              message: "The university portal login result could not be read.",
            }),
        ),
      );
      if (parsed.success !== true) {
        return yield* new InvalidCredentials({
          message: "Check the admission number and the portal password.",
        });
      }
      const jar = new CookieJar();
      const setCookies = response.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookies) {
        yield* Effect.tryPromise({
          try: () => jar.setCookie(cookie, url),
          catch: () =>
            new PortalUnavailable({
              message: "The university portal session could not be kept.",
            }),
        });
      }
      const cookieHeader = yield* Effect.tryPromise({
        try: () => jar.getCookieString(input.baseUrl),
        catch: () =>
          new PortalUnavailable({
            message: "The university portal session could not be kept.",
          }),
      });
      if (cookieHeader.length === 0) {
        return yield* new PortalUnavailable({
          message: "The university portal did not start a session.",
        });
      }
      return { cookieHeader };
    }),
    dashboard: Effect.fn("PortalTransport.dashboard")(function* (input) {
      const url = new URL("/Dashboard/Dashboard", input.baseUrl).toString();
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(url, {
            method: "GET",
            signal,
            headers: { Cookie: input.cookieHeader, Accept: "text/html" },
            redirect: "manual",
          }),
        catch: () =>
          new PortalUnavailable({
            message: "The university portal did not respond.",
          }),
      }).pipe(
        Effect.timeout(timeoutMs),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(new PortalUnavailable({ message: "The university portal took too long to answer." })),
        ),
      );
      if (response.status >= 300 && response.status < 400) {
        return yield* new PortalUnavailable({
          message: "The university portal did not keep the session.",
        });
      }
      if (response.status >= 500) {
        return yield* new PortalUnavailable({
          message: "The university portal is unavailable.",
        });
      }
      return yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new PortalUnavailable({
            message: "The university portal profile page could not be read.",
          }),
      });
    }),
  }),
);
