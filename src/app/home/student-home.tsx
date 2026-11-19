import { ThemeToggle } from "@/components/theme-toggle";
import { borrowerBadgeSvg } from "@/lib/scan/badge";

import { FoundTag } from "./found-tag";
import { SignOutButton } from "./sign-out-button";

/** One real loan still out in this student's name. */
export interface StudentLoanView {
  /** Asset title. */
  readonly assetTitle: string;
  /** Asset tag. */
  readonly assetTag: string;
  /** Due date, or a sentence when the desk set none. */
  readonly dueLabel: string;
}

/** What the signed-in student home is allowed to show. Counts come from this student's custody rows. */
export interface StudentHomeData {
  /** Name from the portal profile, or the account name. */
  readonly name: string;
  /** Two-letter mark beside the name. */
  readonly initials: string;
  /** Admission number and programme, when the profile has them. */
  readonly meta: string;
  /** University on this session. */
  readonly universityName: string;
  /** Admission number printed on the badge. */
  readonly officialId: string | null;
  /** Open loans. Empty when nothing is out. */
  readonly loans: readonly StudentLoanView[];
  /** Open loans. */
  readonly onLoan: number;
  /** Checkouts started in the current UTC calendar year. */
  readonly loansThisTerm: number;
  /** Closed loans with no due date, or checked in on or before the due instant. */
  readonly returnedOnTime: number;
  /** Open loans whose due instant is already past. */
  readonly overdue: number;
}

/**
 * Student home from the Soft Bento screen: borrower badge, real open loans, and the desk note.
 * An empty loan list keeps the empty sentence. Rows are not invented.
 * The badge is the admission number as a QR symbol; without one, the painted bars stay.
 */
export function StudentHome({ data }: { readonly data: StudentHomeData }) {
  const university = data.universityName.toUpperCase();
  const badge = badgeSvg(data.officialId);
  return (
    <div className="flex w-full max-w-[390px] flex-col gap-4 pb-8 lg:max-w-none lg:gap-8 lg:pb-2">
      <header id="profile" className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accsoft text-xs font-semibold text-accent">
          {data.initials}
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{data.name}</p>
          <p className="text-[11px] text-ink3">{data.meta}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden lg:block">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-12">
      <section className="flex flex-col gap-3 rounded-[18px] bg-deep px-[18px] py-[18px] text-on-deep lg:sticky lg:top-8">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[#A9C7AD]">{university}</p>
          <p className="rounded-full bg-[#254430] px-2.5 py-1 text-[10px] font-medium text-[#D8E8D6]">BORROWER</p>
        </div>
        <div>
          <p className="font-display text-xl font-semibold">{data.name}</p>
          {data.officialId !== null ? (
            <p className="mt-1 font-mono text-xs text-[#A9C7AD]">{data.officialId}</p>
          ) : null}
        </div>
        {badge === null ? (
          <div className="flex h-14 items-center gap-[3px] overflow-hidden rounded-lg bg-white px-3" aria-hidden="true">
            <span className="h-[34px] w-0.5 rounded-sm bg-deep" />
            <span className="h-[34px] w-1 rounded-sm bg-deep" />
            <span className="h-[34px] w-0.5 rounded-sm bg-deep" />
            <span className="h-[34px] w-1.5 rounded-sm bg-deep" />
            <span className="h-[34px] w-0.5 rounded-sm bg-deep" />
            <span className="h-[34px] w-1 rounded-sm bg-deep" />
            <span className="h-[34px] w-0.5 rounded-sm bg-deep" />
          </div>
        ) : (
          <div
            role="img"
            aria-label="Borrower badge"
            className="flex items-center justify-center rounded-lg bg-white p-3 [&>svg]:h-40 [&>svg]:w-40 lg:[&>svg]:h-56 lg:[&>svg]:w-56"
            dangerouslySetInnerHTML={{ __html: badge }}
          />
        )}
        <p className="text-xs text-[#A9C7AD]">Show this at the desk</p>
      </section>

      <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
      <section id="loans">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">On loan</h2>
          <p className="font-mono text-xs text-ink3">{data.onLoan}</p>
        </div>
        {data.loans.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-4 py-5">
            <p className="text-sm text-ink2">Nothing is out in your name.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.loans.map((loan) => (
              <li key={loan.assetTag} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <p className="text-sm font-medium text-ink">{loan.assetTitle}</p>
                <p className="font-mono text-[11px] text-ink3">{loan.assetTag}</p>
                <p className="mt-1 text-xs text-ink2">{loan.dueLabel}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Stat value={String(data.loansThisTerm)} label="Loans this term" />
        <Stat value={String(data.returnedOnTime)} label="Returned on time" />
        <Stat value={String(data.overdue)} label="Overdue" />
      </section>

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:gap-6">
      <section className="rounded-2xl border border-line bg-surface px-4 py-4">
        <h2 className="font-display text-lg font-semibold text-ink">Custody history</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink2">Your own loans, as a spreadsheet and as a PDF.</p>
        <div className="mt-3 flex gap-2">
          <a
            href="/reports/custody?format=csv"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-line px-3 text-[13px] font-semibold text-ink"
          >
            Export CSV
          </a>
          <a
            href="/reports/custody?format=pdf"
            className="inline-flex h-9 items-center justify-center rounded-xl bg-accent-fill px-3 text-[13px] font-semibold text-white"
          >
            Export PDF
          </a>
        </div>
      </section>

      <FoundTag />
      </div>

      <p className="text-xs leading-relaxed text-ink3">
        Returns and condition checks are recorded by an attendant at the desk.
      </p>
      </div>
      </div>

      <nav className="grid grid-cols-4 text-center text-[11px] text-ink3 lg:hidden" aria-label="Student">
        <span className="font-semibold text-accent" aria-current="page">
          Home
        </span>
        <span>Scan</span>
        <span>Loans</span>
        <span>Profile</span>
      </nav>

      <div className="lg:hidden">
        <SignOutButton />
      </div>
    </div>
  );
}

function Stat({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-2 py-3 text-center">
      <p className="font-display text-xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-[10px] leading-tight text-ink3">{label}</p>
    </div>
  );
}

/**
 * The badge symbol for one admission number.
 *
 * The payload is the number as the university issues it. A profile without an
 * admission number keeps the painted bars, and a number the encoder refuses
 * falls back to them instead of failing the page.
 *
 * @param officialId - Admission number from the profile, or null.
 * @returns A standalone SVG document, or null when there is nothing to draw.
 */
function badgeSvg(officialId: string | null): string | null {
  if (officialId === null) {
    return null;
  }
  const payload = officialId.trim();
  if (payload.length === 0) {
    return null;
  }
  try {
    return borrowerBadgeSvg(payload);
  } catch {
    return null;
  }
}
