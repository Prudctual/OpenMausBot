import { threadUpdatedLabel } from "./SidebarThreadRow";

/** A reply's time: relative in the row, the full date on hover. */
export function MessageTime({ at, now, className }: { at: number; now: number; className?: string }) {
  return (
    <span title={new Date(at).toLocaleString()} className={className}>
      {threadUpdatedLabel(at, now)}
    </span>
  );
}
