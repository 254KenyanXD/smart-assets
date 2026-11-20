
export type ResolveBody =
  | {
      readonly supported: false;
      readonly many: true;
      readonly institutions: readonly {
        readonly name: string;
        readonly country: string;
        readonly slug: string | null;
      }[];
    }
  | {
      readonly supported: false;
      readonly name: string;
      readonly country: string;
    }
  | { readonly supported: false }
  | {
      readonly supported: true;
      readonly name: string;
      readonly country: string;
      readonly slug: string;
      readonly status: "active" | "suspended";
      readonly adapter: "daystar-portal" | "local" | "oidc";
      readonly portal: "student" | "staff" | null;
      readonly admissionNumber: string | null;
    };
