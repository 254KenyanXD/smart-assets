import { ThemeToggle } from "@/components/theme-toggle";
import { borrowerBadgeSvg } from "@/lib/scan/badge";

import { FoundTag } from "./found-tag";
import { SignOutButton } from "./sign-out-button";

export interface StudentLoanView {
  readonly assetTitle: string;

  readonly assetTag: string;

  readonly dueLabel: string;
}

export interface StudentHomeData {
  readonly name: string;

  readonly initials: string;

  readonly photoUrl: string | null;

  readonly meta: string;

  readonly universityName: string;

  readonly officialId: string | null;

  readonly loans: readonly StudentLoanView[];

  readonly onLoan: number;

  readonly loansThisTerm: number;

  readonly returnedOnTime: number;

  readonly overdue: number;
}

export function StudentHome({ data }: { readonly data: StudentHomeData }) {
  const university = data.universityName.toUpperCase();
  const badge = badgeSvg(data.officialId);
  const photo = portraitSrc(data.photoUrl);
  return (
    <div className="flex w-full max-w-[390px] flex-col gap-4 pb-8 lg:max-w-none lg:gap-8 lg:pb-2">
      <header id="profile" className="flex items-center gap-2.5">
        {photo === null ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accsoft text-xs font-semibold text-accent">
            {data.initials}
          </div>
        ) : (
          <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        )}
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

function portraitSrc(photoUrl: string | null): string | null {
  const value = photoUrl?.trim() ?? "";
  return value.length > 0 ? value : null;
}

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
