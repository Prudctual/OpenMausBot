/**
 * Keyboard shortcuts catalog and platform-specific key resolution.
 * Provides structured shortcut groups for navigation, chat, and workspace management.
 */
import type { LocaleKey } from "@/locales";
import { t } from "@/lib/i18n";

/** Single keyboard shortcut entry with descriptions and platform-specific keys. */
export interface ShortcutItem {
  /** Stable identifier for the shortcut. */
  id: string;
  /** Locale key for what the shortcut does. */
  description: LocaleKey;
  /** Keys displayed on macOS (e.g. ["⌘", "K"]). */
  macKeys: string[];
  /** Keys displayed on Windows and Linux (e.g. ["Ctrl", "K"]). */
  winKeys: string[];
}

/** Group of related shortcuts displayed under a section heading. */
export interface ShortcutGroup {
  /** Category display name (e.g. "Navigation"). */
  category: string;
  /** List of shortcuts belonging to this group. */
  items: ShortcutItem[];
}

/**
 * Complete catalog of keyboard shortcuts available in OpenMausBot,
 * organized logically into categories for quick reference.
 */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    category: "Navigation",
    items: [
      {
        id: "command-palette",
        description: "shortcuts.commandPalette",
        macKeys: ["⌘", "K"],
        winKeys: ["Ctrl", "K"],
      },
      {
        id: "new-bot",
        description: "shortcuts.newBot",
        macKeys: ["⌘", "N"],
        winKeys: ["Ctrl", "N"],
      },
      {
        id: "jump-bot",
        description: "shortcuts.jumpBot",
        macKeys: ["⌘", "1–9"],
        winKeys: ["Ctrl", "1–9"],
      },
      {
        id: "switch-bot",
        description: "shortcuts.switchBot",
        macKeys: ["⌘", "⇧", "[ / ]"],
        winKeys: ["Ctrl", "Shift", "[ / ]"],
      },
      {
        id: "find-conversation",
        description: "shortcuts.findConversation",
        macKeys: ["⌘", "F"],
        winKeys: ["Ctrl", "F"],
      },
    ],
  },
  {
    category: "Chat & Composer",
    items: [
      {
        id: "send-message",
        description: "shortcuts.sendMessage",
        macKeys: ["Return"],
        winKeys: ["Enter"],
      },
      {
        id: "new-line",
        description: "shortcuts.newLine",
        macKeys: ["⇧", "Return"],
        winKeys: ["Shift", "Enter"],
      },
      {
        id: "edit-last-message",
        description: "shortcuts.editLastMessage",
        macKeys: ["↑"],
        winKeys: ["↑"],
      },
      {
        id: "close-panel",
        description: "shortcuts.closePanel",
        macKeys: ["Esc"],
        winKeys: ["Esc"],
      },
      {
        id: "shortcuts-cheat-sheet",
        description: "shortcuts.cheatSheet",
        macKeys: ["⌘", "/"],
        winKeys: ["Ctrl", "/"],
      },
    ],
  },
  {
    category: "Calls",
    items: [
      {
        id: "live-call-mute",
        description: "shortcuts.liveCallMute",
        macKeys: ["⌘", "⇧", "M"],
        winKeys: ["Ctrl", "Shift", "M"],
      },
      {
        id: "live-call-hang-up",
        description: "shortcuts.liveCallHangUp",
        macKeys: ["⌘", "⇧", "H"],
        winKeys: ["Ctrl", "Shift", "H"],
      },
    ],
  },
  {
    category: "Management & Groups",
    items: [
      {
        id: "save-bulletin",
        description: "shortcuts.saveBulletin",
        macKeys: ["⌘", "Return"],
        winKeys: ["Ctrl", "Enter"],
      },
      {
        id: "reorder-section",
        description: "shortcuts.reorderSection",
        macKeys: ["⌥", "↑ / ↓"],
        winKeys: ["Alt", "↑ / ↓"],
      },
    ],
  },
];

/** Help chords must not interrupt editing, composition, or another dialog. */
export function shouldOpenKeyboardShortcuts(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.altKey) return false;
  const helpKey = event.key === "?" && !event.metaKey && !event.ctrlKey;
  const helpChord = event.key === "/" && (event.metaKey || event.ctrlKey) && !event.shiftKey;
  if (!helpKey && !helpChord) return false;
  const target = event.target;
  return !(target instanceof HTMLElement && (
    target.isContentEditable || target.closest("input, textarea, select, dialog, [role=dialog]")
  ));
}

/**
 * Detect whether the current host platform is macOS.
 * Checks Electron's window.ogb bridge first, falling back to navigator.userAgent.
 */
export function isMacPlatform(): boolean {
  if (typeof window !== "undefined" && window.ogb?.platform) {
    return window.ogb.platform === "darwin";
  }
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return navigator.userAgent.includes("Mac");
  }
  return true;
}

/**
 * Resolve the appropriate key representation for a shortcut item based on the host OS.
 */
export function shortcutKeysForPlatform(
  item: Pick<ShortcutItem, "macKeys" | "winKeys">,
  isMac: boolean = isMacPlatform(),
): string[] {
  return isMac ? item.macKeys : item.winKeys;
}

/**
 * Filter shortcut groups by query matching item descriptions or keys.
 */
export function filterShortcutGroups(
  groups: readonly ShortcutGroup[],
  query: string,
  isMac: boolean = isMacPlatform(),
): ShortcutGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...groups];

  return groups
    .map((group) => {
      const filteredItems = group.items.filter((item) => {
        const keys = shortcutKeysForPlatform(item, isMac).join(" ").toLowerCase();
        return (
          t(item.description).toLowerCase().includes(normalized) ||
          group.category.toLowerCase().includes(normalized) ||
          keys.includes(normalized)
        );
      });
      return { ...group, items: filteredItems };
    })
    .filter((group) => group.items.length > 0);
}
