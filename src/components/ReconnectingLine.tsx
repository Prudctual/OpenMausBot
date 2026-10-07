import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";

/** Long enough that one quick live-stream retry does not flash the line. */
export const RECONNECTING_DELAY_MS = 1_500;

let sawLiveConnection = false;

export function resetReconnectingMemory(): void {
  sawLiveConnection = false;
}

/** A quiet line once the live stream drops, after it has been up at least once. */
export function ReconnectingLine() {
  const connected = useStore().state.connected;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (connected) {
      sawLiveConnection = true;
      setShown(false);
      return;
    }
    if (!sawLiveConnection) return;
    const timer = setTimeout(() => setShown(true), RECONNECTING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [connected]);
  if (!shown) return null;
  return (
    <p role="status" className="w-full px-5 pb-1 text-[12px] text-ink-tertiary">
      {t("chat.reconnecting")}
    </p>
  );
}
