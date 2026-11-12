/**
 * Custody mark from the Pen frame Harris chose.
 * The paths are the generated artwork, not a redraw.
 */
export function CustodyMark() {
  return (
    <span className="inline-grid h-[38px] w-[38px] shrink-0" aria-hidden="true">
      <img
        src="/brand/custody-bright.svg"
        alt=""
        className="sa-mark-bright col-start-1 row-start-1 h-full w-full"
      />
      <img
        src="/brand/custody-dark.svg"
        alt=""
        className="sa-mark-dark col-start-1 row-start-1 h-full w-full"
      />
    </span>
  );
}
