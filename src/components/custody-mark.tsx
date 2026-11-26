export function CustodyMark(props: { readonly size?: number }) {
  const size = props.size ?? 38;
  return (
    <span className="inline-grid shrink-0" style={{ height: size, width: size }} aria-hidden="true">
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
