import type { FoundReportRow } from "@/lib/found-store";

/** Everything the attendant found-tag queue reads from the server. */
export interface FoundQueueProps {
  /** Found reports for the signed-in university, newest first. */
  readonly rows: readonly FoundReportRow[];
  /** Sentence when `rows` is empty. */
  readonly emptyLabel?: string;
}

/**
 * Found-tag queue for the attendant desk.
 * It shows the item, the tag, the location, the time and the note. It never says who filed
 * the report and never names the borrower.
 */
export function FoundQueue({ rows, emptyLabel = "No found tags." }: FoundQueueProps) {
  return (
    <section className="rounded-[18px] border border-line bg-surface p-[18px]">
      <h2 className="font-display text-[15px] font-semibold text-ink">Found tags</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink2">{emptyLabel}</p>
      ) : (
        <ul className="mt-3">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-line py-3 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] text-ink">{row.assetTitle}</p>
                <p className="font-mono text-[11px] text-ink3">{stamp(row.createdAt)}</p>
              </div>
              <p className="mt-1 font-mono text-[11px] text-ink2">{row.assetTag}</p>
              <p className="mt-1 text-[11px] text-ink2">{row.locationName ?? "No location"}</p>
              {row.note === null ? null : <p className="mt-1 text-[11px] text-ink3">{row.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Report time in UTC, always in the same shape so the list does not shift between renders.
 *
 * @param value - When the report was filed.
 */
function stamp(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(
    value.getUTCHours(),
  )}:${pad(value.getUTCMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
