"use client";

import { useState } from "react";

import { SchoolRail } from "@/components/school-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { FoundReportRow } from "@/lib/found-store";
import { routeScan, type ScanPhase } from "@/lib/scan/route";

import { checkInAsset, checkoutAsset, previewBorrower, reportFound, type BorrowerPreview } from "./actions";
import { FoundQueue } from "./found-queue";
import { ScanPanel } from "./scan-panel";

export interface DeskAsset {
  readonly title: string;

  readonly tag: string;

  readonly stateLabel: string;

  readonly locationName: string;

  readonly conditionLabel: string;
}

export interface DeskLoan {
  readonly assetId: string;

  readonly assetTitle: string;

  readonly assetTag: string;

  readonly studentLabel: string;

  readonly borrowerName: string;

  readonly when: string;
}

export interface DeskBoardProps {
  readonly universityName: string;

  readonly userName: string;

  readonly userInitials: string;

  readonly userRoleLabel: string;

  readonly subtitle: string;

  readonly assets: readonly DeskAsset[];

  readonly loans: readonly DeskLoan[];

  readonly found: readonly FoundReportRow[];

  readonly strip: {
    readonly outNow: number;
    readonly dueToday: number;
    readonly overdue: number;
    readonly returnsToday: number;
    readonly foundTags: number;
  };
}

export function DeskBoard(props: DeskBoardProps) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [foundTitle, setFoundTitle] = useState<string | null>(null);
  const [foundLocation, setFoundLocation] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [student, setStudent] = useState("");
  const [phase, setPhase] = useState<ScanPhase>("asset");
  const [preview, setPreview] = useState<BorrowerPreview | null>(null);
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
  const visibleFound =
    needle.length === 0
      ? props.found
      : props.found.filter((row) => {
          return (
            row.assetTitle.toLowerCase().includes(needle) ||
            row.assetTag.toLowerCase().includes(needle) ||
            (row.locationName ?? "").toLowerCase().includes(needle) ||
            (row.note ?? "").toLowerCase().includes(needle)
          );
        });
  const foundEmpty = props.found.length === 0 ? "No found tags." : "No found tags match that search.";

  async function showBorrower(key: string): Promise<void> {
    const typed = key.trim();
    if (typed.length === 0) {
      setPreview(null);
      return;
    }
    setPreview(await previewBorrower(typed));
  }

  function handleHit(text: string): void {
    const route = routeScan(phase, text, props.loans);
    if (route.kind === "student") {
      const payload = text.trim();
      setStudent(payload);
      setPhase("asset");
      void showBorrower(payload);
      return;
    }
    if (route.kind === "loan") {
      setPhase("asset");
      const loan = props.loans.find((row) => row.assetId === route.assetId);
      if (loan !== undefined) focusCondition(loan.assetTag);
      return;
    }
    setTag(text.trim());
    setPhase("student");
  }

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
          <section className="flex h-[52px] w-full items-center gap-0 rounded-[14px] border border-line bg-surface px-4">
            {[
              { label: "Out now", value: props.strip.outNow, tone: "accent" as const },
              { label: "Due today", value: props.strip.dueToday, tone: "accent" as const },
              { label: "Overdue", value: props.strip.overdue, tone: "red" as const },
              { label: "Returns today", value: props.strip.returnsToday, tone: "accent" as const },
              { label: "Found tags", value: props.strip.foundTags, tone: "amber" as const },
            ].map((item) => (
              <div key={item.label} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                    item.tone === "red" ? "bg-red" : item.tone === "amber" ? "bg-amber" : "bg-accent"
                  }`}
                />
                <span className="truncate text-[11px] text-ink2">{item.label}</span>
                <span
                  className={`font-mono text-[14px] font-semibold ${
                    item.tone === "red" ? "text-red" : item.tone === "amber" ? "text-amber" : "text-ink"
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-[18px] md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-ink">Day report</h2>
              <p className="mt-1 text-[12px] text-ink2">
                UTC day, including open loans.
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
              Only Available assets can go out.
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
              if (result.message === null) {
                setTag("");
                setStudent("");
                setPreview(null);
                setPhase("asset");
              }
            }}
          >
            <h2 className="font-display text-[15px] font-semibold text-ink md:col-span-2">Checkout</h2>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Asset tag
              <Input
                name="tag"
                required
                maxLength={64}
                autoCapitalize="off"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink3">
              Student email or admission number
              <Input
                name="student"
                required
                autoCapitalize="off"
                value={student}
                onChange={(event) => setStudent(event.target.value)}
                onBlur={() => {
                  void showBorrower(student);
                }}
              />
            </label>
            {preview !== null ? <BorrowerCard preview={preview} /> : null}
            <ScanPanel label={phase === "student" ? "Scan student badge" : "Scan tag"} onHit={handleHit} />
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
          <FoundQueue rows={visibleFound} emptyLabel={foundEmpty} />
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

function BorrowerCard({ preview }: { readonly preview: BorrowerPreview }) {
  if (preview.name === null) {
    return (
      <div className="rounded-xl border border-line bg-alt px-3 py-2 md:col-span-2">
        <p className="text-[12px] text-ink2">
          {preview.message ?? "The borrower is not a student at this university."}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-alt px-3 py-2 md:col-span-2">
      {preview.photoUrl !== null ? (
        <img
          src={preview.photoUrl}
          alt={preview.name}
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : null}
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink">{preview.name}</p>
        <p className="font-mono text-[11px] text-ink3">{preview.officialId ?? "No admission number"}</p>
      </div>
    </div>
  );
}

function focusCondition(tag: string): void {
  const label = `Condition for ${tag}`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const select = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (select === null) {
    return;
  }
  select.focus();
}
