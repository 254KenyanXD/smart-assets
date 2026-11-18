"use client";

import { Fragment, useState, type FormEvent } from "react";

import { SchoolRail } from "@/components/school-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetState } from "@/domain/asset-state";
import { displayLocationKind, labelLocationKind, locationKinds } from "@/domain/location";

import { createLocation, recordMove, registerAsset, updateAsset } from "./actions";

/** One inventory row, already labelled for the table. */
export interface InventoryRow {
  /** Asset id. */
  readonly id: string;
  /** Title. */
  readonly title: string;
  /** Tag. */
  readonly tag: string;
  /** Parsed state, used to choose the record buttons. */
  readonly state: AssetState | null;
  /** Status column. */
  readonly stateLabel: string;
  /** Condition column. Empty when no grade has been recorded. */
  readonly conditionLabel: string;
  /** Location column. Empty when the asset has none. */
  readonly locationName: string;
  /** Location id for the edit form, or an empty string when the asset has none. */
  readonly locationId: string;
  /** Book value, or an empty string when the stored money cannot be used. */
  readonly bookValue: string;
  /** Cost for the edit form. */
  readonly cost: string;
  /** Salvage for the edit form. */
  readonly salvage: string;
  /** Useful life for the edit form. */
  readonly usefulLifeYears: string;
  /** Purchase date, `YYYY-MM-DD`, for the edit form. */
  readonly purchasedOn: string;
  /** UTC date of the last asset change. */
  readonly movedOn: string;
}

/** One location the register form can attach to an asset. */
export interface InventoryLocationChoice {
  /** Location id submitted with the asset. */
  readonly id: string;
  /** Location name. */
  readonly name: string;
  /** Stored kind. Shown with its label when it is one of the three. */
  readonly kind: string;
  /** Department name, or null when the location is for the whole university. */
  readonly departmentName: string | null;
}

/** One department the location form can attach. */
export interface InventoryDepartmentChoice {
  /** Department id. */
  readonly id: string;
  /** Department name. */
  readonly name: string;
}

/** Everything the inventory page reads from the server. */
export interface InventoryBoardProps {
  /** University name in the rail and the breadcrumb. */
  readonly universityName: string;
  /** Signed-in person. */
  readonly userName: string;
  /** Two-letter mark. */
  readonly userInitials: string;
  /** Words for the signed-in role. */
  readonly userRoleLabel: string;
  /** School admins can register, add a location, and record moves. Department heads only read. */
  readonly canWrite: boolean;
  /** Assets of this university. Empty until someone registers one. */
  readonly rows: readonly InventoryRow[];
  /** Locations of this university. Empty until a school administrator adds one. */
  readonly locations: readonly InventoryLocationChoice[];
  /** Departments of this university. Empty when none are recorded. Writers only. */
  readonly departments: readonly InventoryDepartmentChoice[];
}

/**
 * Inventory from the Soft Bento frame: the real assets, their state, and book value.
 * Search filters this table only.
 */
export function InventoryBoard(props: InventoryBoardProps) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const visible =
    needle.length === 0
      ? props.rows
      : props.rows.filter((row) => {
          return (
            row.title.toLowerCase().includes(needle) ||
            row.tag.toLowerCase().includes(needle) ||
            row.stateLabel.toLowerCase().includes(needle) ||
            shownCondition(row.conditionLabel).toLowerCase().includes(needle) ||
            row.locationName.toLowerCase().includes(needle)
          );
        });
  const onLoan = props.rows.filter((row) => row.state === "in_custody").length;

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="Inventory"
        current="Inventory"
        hrefs={
          props.canWrite
            ? {
                Staff: "/school/staff",
                Inventory: "/school/inventory",
                Reports: "/school/reports",
                "Audit trail": "/school/audit",
              }
            : { Inventory: "/school/inventory", Reports: "/school/reports" }
        }
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
              <li className="font-medium text-ink2">Inventory</li>
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
            <h1 className="font-display text-[24px] font-semibold text-ink">Inventory</h1>
            <p className="text-[12.5px] text-ink3">
              {props.rows.length} tagged, {onLoan} on loan
            </p>
          </div>
          {props.canWrite ? (
            <LocationForm
              departments={props.departments}
              onDone={(next) => {
                setMessage(next);
              }}
            />
          ) : null}
          {props.canWrite ? (
            <RegisterForm
              locations={props.locations}
              onDone={(next) => {
                setMessage(next);
              }}
            />
          ) : null}
          {message !== null ? <p className="text-sm text-ink2">{message}</p> : null}
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Assets</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Asset
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Tag
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Condition
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Status
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Location
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Book value
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Last movement
                    </th>
                    {props.canWrite ? (
                      <th scope="col" className="py-2.5 text-[10px] font-semibold text-ink3">
                        Record
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {props.rows.length === 0 ? (
                    <tr>
                      <td colSpan={props.canWrite ? 8 : 7} className="py-6 text-sm text-ink2">
                        No assets yet.
                      </td>
                    </tr>
                  ) : visible.length === 0 ? (
                    <tr>
                      <td colSpan={props.canWrite ? 8 : 7} className="py-6 text-sm text-ink2">
                        No assets match that search.
                      </td>
                    </tr>
                  ) : (
                    visible.map((row) => (
                      <Fragment key={row.id}>
                        <tr className="border-b border-line last:border-b-0">
                          <td className="py-3 pr-3 text-[12px] font-medium text-ink">{row.title}</td>
                          <td className="py-3 pr-3 font-mono text-[11px] text-ink3">{row.tag}</td>
                          <td className="py-3 pr-3 text-[12px] text-ink2">{shownCondition(row.conditionLabel)}</td>
                          <td className="py-3 pr-3 text-[12px] text-ink">{row.stateLabel}</td>
                          <td className="py-3 pr-3 text-[12px] text-ink2">{row.locationName}</td>
                          <td className="py-3 pr-3 font-mono text-[11px] text-ink2">{row.bookValue}</td>
                          <td className="py-3 pr-3 font-mono text-[11px] text-ink3">{row.movedOn}</td>
                          {props.canWrite ? (
                            <td className="py-3">
                              <div className="flex flex-col items-start gap-2">
                                <MoveButtons
                                  assetId={row.id}
                                  state={row.state}
                                  onDone={(next) => {
                                    setMessage(next);
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="quiet"
                                  className="h-9 px-3"
                                  onClick={() => {
                                    setEditingId(editingId === row.id ? null : row.id);
                                  }}
                                >
                                  {editingId === row.id ? "Close edit" : "Edit"}
                                </Button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                        {props.canWrite && editingId === row.id ? (
                          <tr className="border-b border-line">
                            <td colSpan={8} className="py-3">
                              <EditForm
                                row={row}
                                locations={props.locations}
                                onDone={(next) => {
                                  setMessage(next);
                                  if (next === null) {
                                    setEditingId(null);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function LocationForm(props: {
  readonly departments: readonly InventoryDepartmentChoice[];
  readonly onDone: (message: string | null) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await createLocation(new FormData(form));
    props.onDone(result.message);
    if (result.message === null) {
      form.reset();
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-[18px] border border-line bg-surface p-[18px] md:grid-cols-3">
      <h2 className="font-display text-[15px] font-semibold text-ink md:col-span-3">Add a location</h2>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Name
        <Input name="name" required maxLength={80} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Kind
        <select name="kind" required className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink">
          {locationKinds.map((kind) => (
            <option key={kind} value={kind}>
              {labelLocationKind(kind)}
            </option>
          ))}
        </select>
      </label>
      {props.departments.length === 0 ? (
        <p className="self-end text-[12px] text-ink2">
          No department is recorded, so this location is for the whole university.
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-[11px] text-ink3">
          Department
          <select name="departmentId" className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink">
            <option value="">Whole university</option>
            {props.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="md:col-span-3">
        <Button type="submit">Add location</Button>
      </div>
    </form>
  );
}

function RegisterForm(props: {
  readonly locations: readonly InventoryLocationChoice[];
  readonly onDone: (message: string | null) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await registerAsset(new FormData(form));
    props.onDone(result.message);
    if (result.message === null) {
      form.reset();
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-[18px] border border-line bg-surface p-[18px] md:grid-cols-3">
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Title
        <Input name="title" required maxLength={120} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Tag
        <Input name="tag" required maxLength={64} autoCapitalize="off" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Purchase date
        <Input name="purchasedOn" type="date" required />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Cost
        <Input name="cost" inputMode="numeric" required />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Salvage
        <Input name="salvage" inputMode="numeric" required />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Useful life in years
        <Input name="usefulLifeYears" inputMode="numeric" required />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3 md:col-span-3">
        Location
        <select name="locationId" className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink">
          <option value="">No location</option>
          {props.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {locationLabel(location)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[12px] text-ink2 md:col-span-3">
        Condition is recorded when the asset is checked in. A new asset starts as Procured until you mark it available.
      </p>
      <div className="md:col-span-3">
        <Button type="submit">Register asset</Button>
      </div>
    </form>
  );
}

function EditForm(props: {
  readonly row: InventoryRow;
  readonly locations: readonly InventoryLocationChoice[];
  readonly onDone: (message: string | null) => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await updateAsset(new FormData(form));
    props.onDone(result.message);
  }
  return (
    <form key={props.row.id} onSubmit={submit} className="grid gap-3 md:grid-cols-3">
      <input type="hidden" name="assetId" value={props.row.id} />
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Title
        <Input name="title" required maxLength={120} defaultValue={props.row.title} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Tag
        <Input name="tag" required maxLength={64} autoCapitalize="off" defaultValue={props.row.tag} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Purchase date
        <Input name="purchasedOn" type="date" required defaultValue={props.row.purchasedOn} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Cost
        <Input name="cost" inputMode="numeric" required defaultValue={props.row.cost} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Salvage
        <Input name="salvage" inputMode="numeric" required defaultValue={props.row.salvage} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Useful life in years
        <Input name="usefulLifeYears" inputMode="numeric" required defaultValue={props.row.usefulLifeYears} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink3">
        Location
        <select
          name="locationId"
          defaultValue={props.row.locationId}
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          <option value="">No location</option>
          {props.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {locationLabel(location)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[12px] text-ink2 md:col-span-3">This edit does not change the status or the condition.</p>
      <div className="md:col-span-3">
        <Button type="submit">Save asset</Button>
      </div>
    </form>
  );
}

function shownCondition(label: string): string {
  return label.length === 0 ? "None yet" : label;
}

function locationLabel(location: InventoryLocationChoice): string {
  const kind = displayLocationKind(location.kind);
  if (location.departmentName === null) {
    return `${location.name} (${kind})`;
  }
  return `${location.name} (${kind}, ${location.departmentName})`;
}

function MoveButtons(props: {
  readonly assetId: string;
  readonly state: AssetState | null;
  readonly onDone: (message: string | null) => void;
}) {
  const targets = movesFor(props.state);
  if (targets.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((target) => (
        <form
          key={target.to}
          action={async (formData) => {
            const result = await recordMove(formData);
            props.onDone(result.message);
          }}
        >
          <input type="hidden" name="assetId" value={props.assetId} />
          <input type="hidden" name="to" value={target.to} />
          <Button type="submit" variant="quiet" className="h-9 px-3">
            {target.label}
          </Button>
        </form>
      ))}
    </div>
  );
}

function movesFor(state: AssetState | null): readonly { readonly to: AssetState; readonly label: string }[] {
  switch (state) {
    case "procured":
      return [{ to: "available", label: "Mark available" }];
    case "available":
      return [
        { to: "under_maintenance", label: "Send to maintenance" },
        { to: "decommissioned", label: "Decommission" },
      ];
    case "under_maintenance":
      return [
        { to: "available", label: "Mark available" },
        { to: "decommissioned", label: "Decommission" },
      ];
    default:
      return [];
  }
}
