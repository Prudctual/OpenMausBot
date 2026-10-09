// "New chat" from the sidebar's "+" menu: a panel over the chat area, beside
// the sidebar, that starts a conversation with any bot in two keystrokes.
// Type a name in "To:", arrow to a row, Enter. The two ways to make someone
// new (a bot, a group chat) sit on top, so the panel is never a dead end.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Bot as BotIcon, Users, X } from "lucide-react";
import { useStore, type Bot } from "@/state/store";
import { rankByName } from "@/lib/palette-rank";
import { useShowThreads } from "@/lib/thread-preferences";
import { usePopoverDismiss } from "@/hooks/use-popover-dismiss";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { BotAvatar } from "./Avatar";

/** Below this much room beside the sidebar the panel takes the whole width
 * (a phone, or a narrow window with the sidebar open over the chat). */
const MIN_BESIDE_WIDTH = 320;
const PANEL_WIDTH = 360;
/** "Create new bot" and "Create group chat" come before the bots. */
const ACTION_COUNT = 2;

/** Where the panel sits: flush against the sidebar's inner edge when there is
 * room, otherwise across the full window. A right-to-left layout puts the
 * sidebar on the right, so the panel opens to its left. */
export function newChatPanelPlacement(
  sidebar: { left: number; right: number } | null,
  viewportWidth: number,
  rtl = false,
): { left: number; width: number } {
  if (!sidebar) return { left: 0, width: viewportWidth };
  const room = rtl ? sidebar.left : viewportWidth - sidebar.right;
  if (room < MIN_BESIDE_WIDTH) return { left: 0, width: viewportWidth };
  const width = Math.min(PANEL_WIDTH, room);
  return { left: rtl ? sidebar.left - width : sidebar.right, width };
}

/** One line under the name: the bot's title, else its description's first line. */
export function newChatSubtext(bot: Pick<Bot, "title" | "description">): string {
  return bot.title?.trim() || bot.description?.trim().split("\n")[0]?.trim() || "";
}

export function SidebarNewChatPanel({
  anchor,
  onClose,
  onNewBot,
  onNewGroup,
  style,
}: {
  /** the sidebar, whose right edge the panel opens against */
  anchor: HTMLElement | null;
  onClose: () => void;
  onNewBot: () => void;
  onNewGroup: () => void;
  /** Electron's no-drag region, so the panel stays clickable over a title bar */
  style?: CSSProperties;
}) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const [query, setQuery] = useState("");
  // the first bot, not "Create new bot": Enter right away should start a chat
  const [cursor, setCursor] = useState(ACTION_COUNT);
  const [place, setPlace] = useState(() => newChatPanelPlacement(null, typeof window === "undefined" ? 0 : window.innerWidth));
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  usePopoverDismiss(true, rootRef, onClose);

  useLayoutEffect(() => {
    const measure = () => setPlace(newChatPanelPlacement(
      anchor ? anchor.getBoundingClientRect() : null,
      window.innerWidth,
      anchor ? getComputedStyle(anchor).direction === "rtl" : false,
    ));
    measure();
    window.addEventListener("resize", measure);
    const observer = anchor && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (anchor) observer?.observe(anchor);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [anchor]);

  useLayoutEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const bots = rankByName(state.bots.filter((bot) => !bot.hidden), query);
  const actions = [
    { key: "bot", icon: <BotIcon size={14} />, label: t("sidebar.newChat.createBot"), run: onNewBot },
    { key: "group", icon: <Users size={14} />, label: t("sidebar.newChat.createGroup"), run: onNewGroup },
  ];
  // one cursor over both: the two actions first, then the bots
  const count = actions.length + bots.length;
  // A filter that matches no bot leaves nothing selected, so Enter on a typo
  // never falls through to one of the create actions.
  const selected = cursor < actions.length ? cursor : bots.length ? Math.min(cursor, count - 1) : -1;
  const rowLabel = showThreads ? t("sidebar.newChat.start") : t("sidebar.newChat.open");

  const start = (bot: Bot) => {
    // Simple mode keeps one conversation per bot, so it opens that one.
    dispatch(showThreads ? { type: "newTask", botId: bot.id } : { type: "select", id: bot.id });
    onClose();
  };
  const activate = (index: number) => {
    if (index < actions.length) actions[index]?.run();
    else {
      const bot = bots[index - actions.length];
      if (bot) start(bot);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor(selected < 0 ? 0 : (selected + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(selected < 0 ? actions.length - 1 : (selected - 1 + count) % count);
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      if (selected >= 0) activate(selected);
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("sidebar.newChat.title")}
      data-new-chat-panel=""
      data-native-view-overlay=""
      onKeyDown={onKeyDown}
      style={{ ...style, left: place.left, width: place.width }}
      className="fixed inset-y-0 z-40 flex animate-panel-in flex-col border-e border-hairline/40 bg-card shadow-2xl shadow-black/40"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline/40 px-4">
        <label htmlFor="new-chat-to" className="shrink-0 text-[13px] font-medium text-ink-secondary">{t("sidebar.newChat.to")}</label>
        <input
          id="new-chat-to"
          autoFocus
          dir="auto"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setCursor(actions.length); }}
          placeholder={t("sidebar.newChat.placeholder")}
          aria-label={t("sidebar.newChat.placeholder")}
          aria-controls="new-chat-bots"
          autoComplete="off"
          spellCheck={false}
          className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none"
        />
        {/* At full width there is no outside to press, so the panel says how to leave. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          title={t("common.close")}
          className="-me-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-secondary outline-none hover:bg-raised hover:text-ink focus-visible:bg-raised"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline/40 px-3 py-2">
        {actions.map((action, index) => (
          <button
            key={action.key}
            type="button"
            ref={index === selected ? selectedRef : undefined}
            onClick={action.run}
            onMouseMove={() => setCursor(index)}
            className={cn(
              "flex h-7 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-ink outline-none focus-visible:bg-raised",
              index === selected && "bg-raised",
            )}
          >
            <span className="text-ink-secondary">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
      <div id="new-chat-bots" role="list" className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.bots.every((bot) => bot.hidden) ? (
          <div className="px-3 py-6 text-center text-[13px] text-ink-secondary">{t("sidebar.newChannel.emptyHint")}</div>
        ) : bots.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-ink-secondary">{t("sidebar.newChat.noMatch", { query: query.trim() })}</div>
        ) : bots.map((bot, i) => {
          // The pointer selects by moving (onMouseMove), so exactly one row is
          // ever lit, whether the keyboard or the mouse put it there.
          const index = actions.length + i;
          const subtext = newChatSubtext(bot);
          return (
            <div role="listitem" key={bot.id}>
              <button
                type="button"
                ref={index === selected ? selectedRef : undefined}
                onClick={() => start(bot)}
                // mousemove, not mouseenter: a list scrolling under a resting
                // pointer must not steal the keyboard selection
                onMouseMove={() => setCursor(index)}
                aria-label={`${bot.name}${subtext ? `, ${subtext}` : ""}. ${rowLabel}`}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start outline-none focus-visible:bg-raised",
                  index === selected && "bg-raised",
                )}
              >
                <BotAvatar bot={bot} state="happy" size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="auto" className="truncate text-[13px] font-semibold text-ink">{bot.name}</span>
                  {subtext && <span dir="auto" className="truncate text-[12px] text-ink-secondary">{subtext}</span>}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 text-[12px] font-medium text-ink-secondary",
                    index === selected ? "opacity-100" : "opacity-0 group-focus-visible:opacity-100",
                  )}
                >
                  {rowLabel}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
