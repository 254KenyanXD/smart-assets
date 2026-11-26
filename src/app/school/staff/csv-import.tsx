"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { CSV_MAX_BYTES, CSV_TOO_BIG_MESSAGE } from "@/domain/staff-csv";

interface ImportRow {
  readonly line: number;

  readonly fullName: string;

  readonly email: string;

  readonly roleLabel: string;

  readonly result: "invite" | "skip";

  readonly reason: string | null;
}

interface ImportPreview {
  readonly inviteCount: number;

  readonly skipCount: number;

  readonly rows: readonly ImportRow[];

  readonly resultsCsv?: string;
}

export function CsvImport() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewCsv, setPreviewCsv] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function takeFile(file: File) {
    if (file.size > CSV_MAX_BYTES) {
      setNotice(CSV_TOO_BIG_MESSAGE);
      setCsv(null);
      setPreview(null);
      setFileName(file.name);
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setPreview(null);
    setPreviewCsv(null);
    setNotice(null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      void takeFile(file);
    }
  }

  async function validate() {
    if (csv === null) {
      setNotice("Choose a CSV file.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/auth/staff-import/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setPreview(null);
      setNotice(messageFrom(body));
      return;
    }
    const parsed = parsePreview(body);
    if (parsed === null) {
      setNotice("The file could not be checked.");
      return;
    }
    setPreview(parsed);
    setPreviewCsv(csv);
  }

  async function commit() {
    if (csv === null || preview === null || previewCsv !== csv || preview.inviteCount === 0) {
      return;
    }
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/auth/staff-import/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    setBusy(false);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(messageFrom(body));
      return;
    }
    const parsed = parsePreview(body);
    if (parsed === null) {
      setNotice("The invites could not be created.");
      return;
    }
    setPreview(parsed);
    setPreviewCsv(csv);
    router.refresh();
  }

  function downloadResults() {
    if (preview?.resultsCsv === undefined) {
      return;
    }
    const blob = new Blob([preview.resultsCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "staff-import-results.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const ready = preview !== null && previewCsv === csv;
  const counts =
    ready && preview !== null
      ? `${preview.inviteCount} will be invited, ${preview.skipCount} skipped`
      : "No file checked yet";

  return (
    <section className="flex flex-col gap-[14px] rounded-[18px] border border-line bg-surface p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-[9px]">
          <h2 className="font-display text-[15px] font-semibold text-ink">Bulk import from CSV</h2>
          <span className="rounded-full bg-role px-[9px] py-1 text-[10px] font-medium text-ink2">CSV</span>
        </div>
        <p className="text-[10.5px] text-ink3">500 rows, 1 MB, attendant or dept head only</p>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <label
          htmlFor="staff-csv"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="flex h-24 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border border-line bg-alt text-center"
        >
          <span className="text-[12.5px] font-medium text-ink">{fileName ?? "Choose a CSV file"}</span>
          <span className="text-[10px] text-ink3">
            {preview?.resultsCsv !== undefined
              ? "Imported. The links are in the results file."
              : fileName === null
                ? "Not imported until you commit"
                : "Chosen file, not yet imported"}
          </span>
          <input
            id="staff-csv"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                void takeFile(file);
              }
            }}
          />
        </label>
        <div className="flex w-full flex-col gap-2 lg:w-[300px]">
          <p className="text-[12px] font-medium text-ink">{counts}</p>
          <p className="text-[10px] leading-[15px] text-ink3">University comes from your session.</p>
          <div className="flex gap-2">
            <Button variant="quiet" className="h-[38px] w-[120px]" disabled={busy || csv === null} onClick={() => void validate()}>
              Validate
            </Button>
            <Button
              className="h-[38px] flex-1"
              disabled={busy || !ready || preview === null || preview.inviteCount === 0}
              onClick={() => void commit()}
            >
              {ready && preview !== null && preview.inviteCount > 0 ? `Commit ${preview.inviteCount} invites` : "Commit"}
            </Button>
          </div>
        </div>
      </div>
      {notice !== null ? <p className="text-sm text-red">{notice}</p> : null}
      {preview?.resultsCsv !== undefined ? (
        <button type="button" className="self-start text-[12px] font-medium text-accent" onClick={downloadResults}>
          Download the results file
        </button>
      ) : null}
      <div className="h-px bg-line" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-[160px] py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                Name
              </th>
              <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                Email
              </th>
              <th scope="col" className="w-[100px] py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                Role
              </th>
              <th scope="col" className="w-[140px] py-2.5 text-[10px] font-semibold text-ink3">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {preview === null || previewCsv !== csv ? (
              <tr>
                <td colSpan={4} className="py-6 text-sm text-ink2">
                  Choose a file, then validate it.
                </td>
              </tr>
            ) : preview.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-sm text-ink2">
                  The file has no rows.
                </td>
              </tr>
            ) : (
              preview.rows.map((row) => (
                <tr key={row.line} className="border-b border-line last:border-b-0">
                  <td className="py-[11px] pr-3 text-[11.5px] font-medium text-ink">{row.fullName}</td>
                  <td className="py-[11px] pr-3 font-mono text-[10.5px] text-ink3">{row.email}</td>
                  <td className="py-[11px] pr-3 text-[11.5px] text-ink2">{row.roleLabel}</td>
                  <td className={`py-[11px] text-[11.5px] font-medium ${row.result === "invite" ? "text-accent" : "text-amber"}`}>
                    {row.result === "invite" ? "Invite" : `Skipped: ${row.reason ?? "left out"}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function parsePreview(body: unknown): ImportPreview | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  if (!("inviteCount" in body) || !("skipCount" in body) || !("rows" in body)) {
    return null;
  }
  if (typeof body.inviteCount !== "number" || typeof body.skipCount !== "number" || !Array.isArray(body.rows)) {
    return null;
  }
  const rows: ImportRow[] = [];
  for (const row of body.rows) {
    if (typeof row !== "object" || row === null) {
      return null;
    }
    if (
      !("line" in row) ||
      !("fullName" in row) ||
      !("email" in row) ||
      !("roleLabel" in row) ||
      !("result" in row) ||
      !("reason" in row)
    ) {
      return null;
    }
    if (
      typeof row.line !== "number" ||
      typeof row.fullName !== "string" ||
      typeof row.email !== "string" ||
      typeof row.roleLabel !== "string" ||
      (row.result !== "invite" && row.result !== "skip") ||
      (row.reason !== null && typeof row.reason !== "string")
    ) {
      return null;
    }
    rows.push({
      line: row.line,
      fullName: row.fullName,
      email: row.email,
      roleLabel: row.roleLabel,
      result: row.result,
      reason: row.reason,
    });
  }
  const resultsCsv = "resultsCsv" in body && typeof body.resultsCsv === "string" ? body.resultsCsv : undefined;
  return { inviteCount: body.inviteCount, skipCount: body.skipCount, rows, ...(resultsCsv === undefined ? {} : { resultsCsv }) };
}

function messageFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return "The file could not be checked.";
}
