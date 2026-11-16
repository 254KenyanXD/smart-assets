"use client";

import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { SchoolRail } from "@/components/school-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { checkInAsset, checkoutAsset, reportFound } from "./actions";

/** One asset the attendant can look up before checkout. */
export interface DeskAsset {
  /** Title. */
  readonly title: string;
  /** Tag. */
  readonly tag: string;
  /** Status words, including Procured and Available. */
  readonly stateLabel: string;
  /** Location name, or "No location". */
  readonly locationName: string;
  /** Last check-in grade, or "None yet". */
  readonly conditionLabel: string;
}

/** One open loan the attendant can check back in. */
export interface DeskLoan {
  /** Asset id posted with the check-in. */
  readonly assetId: string;
  /** Asset title. */
  readonly assetTitle: string;
  /** Asset tag. */
  readonly assetTag: string;
  /** Admission number when the profile has one, otherwise the account name. */
  readonly studentLabel: string;
  /** Account name, shown under the admission number when both exist. */
  readonly borrowerName: string;
  /** Checkout time, UTC. */
  readonly when: string;
}

/** Everything the attendant desk reads from the server. */
export interface DeskBoardProps {
  /** University name in the rail. */
  readonly universityName: string;
  /** Signed-in attendant. */
  readonly userName: string;
  /** Two-letter mark. */
  readonly userInitials: string;
  /** Words for the attendant role. */
  readonly userRoleLabel: string;
  /** Real date and name, in the desk subtitle. */
  readonly subtitle: string;
  /** Every asset in this university. The attendant can read them and cannot edit them. */
  readonly assets: readonly DeskAsset[];
  /** Open loans. Empty until a checkout exists. */
  readonly loans: readonly DeskLoan[];
}

/**
 * Attendant desk: type a tag, check it out, and grade it on the way back.
 * The camera is not on this page. A found-item result shows the title and the location only.
 */
export function DeskBoard(props: DeskBoardProps) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [foundTitle, setFoundTitle] = useState<string | null>(null);
  const [foundLocation, setFoundLocation] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const visibleAssets =
    needle.length === 0
      ? props.assets
      : props.assets.filter((asset) => {
          return (
            asset.title.toLowerCase().includes(needle) ||
            asset.tag.toLowerCase().includes(needle) ||
            asset.stateLabel.toLowerCase().includes(needle) ||
            asset.locationName.toLowerCase().includes(needle) ||
            asset.conditionLabel.toLowerCase().includes(needle)
          );
        });
  const visible =
    needle.length === 0
      ? props.loans
      : props.loans.filter((loan) => {
          return (
            loan.assetTitle.toLowerCase().includes(needle) ||
            loan.assetTag.toLowerCase().includes(needle) ||
            loan.studentLabel.toLowerCase().includes(needle) ||
            loan.borrowerName.toLowerCase().includes(needle)
          );
        });

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="Desk"
        current="Desk"
        hrefs={{ Desk: "/desk" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-3 md:flex-row md:items-center md:justify-between md:px-7">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-[6px] text-[12px]">
              <li className="text-ink3">{props.universityName}</li>
              <li aria-hidden="true" className="text-ink3">
                <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden="true">
                  <path d="M5 3.5 L8.5 7 L5 10.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </li>
              <li className="font-medium text-ink2">Desk</li>
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-[10px]">
            <input
              type="search"
              aria-label="Search assets, tags, students"
              placeholder="Search assets, tags, students"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-[38px] w-full min-w-0 rounded-[10px] border border-line bg-alt px-3 text-[12px] text-ink outline-none placeholder:text-ink3 focus:border-accent md:w-[260px]"
            />
            <ThemeToggle />
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {props.userInitials}
            </span>
          </div>
        </header>
        <main className="flex flex-col gap-5 p-[20px] md:p-[24px_28px_26px_28px]">
          <div className="flex flex-col gap-[6px]">
            <h1 className="font-display text-[24px] font-semibold text-ink">Desk</h1>
            <p className="text-[12.5px] text-ink3">{props.subtitle}</p>
          </div>
          <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[18px] md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-ink">Day report</h2>
              <p className="mt-1 text-[12px] text-ink2">
                Custody history for this UTC day, including loans that are still open.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/reports/custody?format=csv"
                className="inline-flex h-[38px] items-center justify-center rounded-xl border border-line bg-surface px-3 text-[13.5px] font-semibold text-ink"
              >
                Export CSV
              </a>
              <a
                href="/reports/custody?format=pdf"
                className="inline-flex h-[38px] items-center justify-center rounded-xl bg-accent-fill px-3 text-[13.5px] font-semibold text-white"
              >
                Export PDF
              </a>
            </div>
          </section>
          {message !== null ? <p className="text-sm text-ink2">{message}</p> : null}
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Assets</h2>
            <p className="mt-1 text-[12px] text-ink2">
              Checkout needs an Available asset. A school administrator marks a Procured asset available.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Asset
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Tag
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Status
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Location
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold text-ink3">
                      Condition
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {props.assets.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-ink2">
                        No assets yet.
                      </td>
                    </tr>
                  ) : visibleAssets.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-ink2">
                        No assets match that search.
                      </td>
                    </tr>
                  ) : (
                    visibleAssets.map((asset) => (
                      <tr key={asset.tag} className="border-b border-line last:border-b-0">
                        <td className="py-3 pr-3 text-[12px] font-medium text-ink">{asset.title}</td>
                        <td className="py-3 pr-3 font-mono text-[11px] text-ink3">{asset.tag}</td>
                        <td className="py-3 pr-3 text-[12px] text-ink">{asset.stateLabel}</td>
                        <td className="py-3 pr-3 text-[12px] text-ink2">{asset.locationName}</td>
                        <td className="py-3 text-[12px] text-ink2">{asset.conditionLabel}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <form
            className="grid gap-3 rounded-[18px] border border-line bg-surface p-[18px] md:grid-cols-2"
            action={async (formData) => {
              const result = await checkoutAsset(formData);
              setFoundTitle(null);
              setFoundLocation(null);
              setMessage(result.message);
            }}
          >
            <h2 className="font-display text-[15px] font-semibold text-ink md:col-span-2">Checkout</h2>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Asset tag
              <Input name="tag" required maxLength={64} autoCapitalize="off" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Student email
              <Input name="email" type="email" required autoCapitalize="off" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Due date
              <Input name="due" type="date" />
            </label>
            <div className="flex items-end">
              <Button type="submit">Confirm checkout</Button>
            </div>
          </form>
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Open loans</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Time
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Asset
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Student
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Condition
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold text-ink3">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {props.loans.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-ink2">
                        Nothing is out.
                      </td>
                    </tr>
                  ) : visible.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-ink2">
                        No open loans match that search.
                      </td>
                    </tr>
                  ) : (
                    visible.map((loan) => (
                      <tr key={loan.assetId} className="border-b border-line last:border-b-0">
                        <td className="py-3 pr-3 font-mono text-[11px] text-ink3">{loan.when}</td>
                        <td className="py-3 pr-3">
                          <p className="text-[12px] text-ink">{loan.assetTitle}</p>
                          <p className="font-mono text-[11px] text-ink3">{loan.assetTag}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-mono text-[11px] text-ink">{loan.studentLabel}</p>
                          {loan.studentLabel !== loan.borrowerName ? (
                            <p className="text-[11px] text-ink3">{loan.borrowerName}</p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3" colSpan={2}>
                          <form
                            className="flex flex-wrap items-center gap-2"
                            action={async (formData) => {
                              const result = await checkInAsset(formData);
                              setFoundTitle(null);
                              setFoundLocation(null);
                              setMessage(result.message);
                            }}
                          >
                            <input type="hidden" name="assetId" value={loan.assetId} />
                            <select
                              name="condition"
                              defaultValue="good"
                              aria-label={`Condition for ${loan.assetTag}`}
                              className="h-9 rounded-xl border border-line bg-surface px-2 text-[12px] text-ink"
                            >
                              <option value="good">Good</option>
                              <option value="wear">Minor wear</option>
                              <option value="damaged">Damaged</option>
                            </select>
                            <Button type="submit" className="h-9 px-3">
                              Check in
                            </Button>
                          </form>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <form
            className="grid gap-3 rounded-[18px] border border-line bg-surface p-[18px] md:grid-cols-2"
            action={async (formData) => {
              const result = await reportFound(formData);
              setMessage(result.message);
              setFoundTitle(result.foundTitle);
              setFoundLocation(result.foundLocation);
            }}
          >
            <h2 className="font-display text-[15px] font-semibold text-ink md:col-span-2">Found tag</h2>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Asset tag
              <Input name="tag" required maxLength={64} autoCapitalize="off" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Note
              <Input name="note" />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" variant="quiet">
                Report found tag
              </Button>
            </div>
            {foundTitle !== null ? (
              <p className="text-sm text-ink md:col-span-2">
                {foundTitle}
                {foundLocation === null ? ". No location is recorded." : ` at ${foundLocation}.`}
              </p>
            ) : null}
          </form>
        </main>
      </div>
    </div>
  );
}
