// Fan-in event bus — port of upstream's ProviderService fan-in +
// EventNdjsonLogger tee, minus Effect. Every adapter's event stream merges
// into one bus; each event is stamped with its providerInstanceId, teed to
// a per-thread canonical NDJSON log (the debugging trick both upstream and
// agentcal lean on), and delivered to subscribers (the SSE endpoint and
// the server-side message folder).
//
// Streamed text is merged here, once, for every engine on every kind of
// install: a provider sends a reply as hundreds of small text deltas, and
// each would otherwise be its own log line, listener call and SSE frame. The
// bus holds a thread's text for at most DELTA_MERGE_MS and publishes it as
// one delta, sooner when anything else happens on that thread, so the order
// of events never changes.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

import { EVENTS_DIR } from "../config.ts";
import { redactSecrets } from "../redact.ts";
import { capThreadLog, currentThreadLogCap } from "../thread-log-rotation.ts";
import { newId, type ProviderInstance, type RuntimeEvent, type RuntimeEventListener } from "../contracts.ts";

const INCOMPLETE_LOG_MESSAGE =
  "Canonical event history is incomplete: OpenMausBot could not write one or more events to disk. Live updates will continue.";

/** How long a thread's streamed text waits to be merged with what follows. */
const DELTA_MERGE_MS = 50;

/** One append of adjacent lines. Keeps a single slow write from holding the
 * whole backlog, and keeps the lines that arrived in one turn together. */
const MAX_BATCH_LINES = 64;

/** In-memory ceiling. Past this, live delivery continues and the canonical
 * log records the same incomplete-history marker a failed disk write does. */
const MAX_QUEUED_EVENTS = 256;
const MAX_QUEUED_BYTES = 1024 * 1024;

/** Disk append used by the canonical log. Sync throws and async rejections
 * are both write failures. Tests and the persistence bench inject their own. */
export type EventLogAppend = (
  path: string,
  data: string,
  options?: { mode?: number },
) => void | Promise<void>;

const defaultAppend: EventLogAppend = (path, data, options) => appendFile(path, data, options);

type QueuedLog = { event: RuntimeEvent; bytes: number };

/** Where the incomplete-log marker sits relative to events already accepted. */
type WarningPlacement = "before" | "after";

type TextDelta = Extract<RuntimeEvent, { type: "content.delta" }>;

/** Two deltas are one stream when only their text, id and time differ. */
function sameStream(a: TextDelta, b: TextDelta): boolean {
  return a.provider === b.provider && a.providerInstanceId === b.providerInstanceId && a.turnId === b.turnId &&
    a.itemId === b.itemId && a.streamKind === b.streamKind && a.synthetic === b.synthetic;
}

/** A turn ending, a session ending, or a terminal runtime error. The queued
 * lines up to and including this event are flushed rather than left batched. */
function isTerminalEvent(event: RuntimeEvent): boolean {
  if (event.type === "turn.completed" || event.type === "cap.exhausted" || event.type === "session.exited") {
    return true;
  }
  return event.type === "runtime.error" && event.terminal === true;
}

export class EventBus {
  private listeners = new Set<RuntimeEventListener>();
  private unsubscribes = new Map<string, () => void>();
  private pendingLogWarnings = new Map<string, RuntimeEvent>();
  /** Per thread: the streamed text not yet published, and when it goes. */
  private pendingText = new Map<string, { event: TextDelta; timer: ReturnType<typeof setTimeout> }>();
  private readonly appendLog: EventLogAppend;
  /** Accepted events not yet handed to the append, in publish order. */
  private queued: QueuedLog[] = [];
  private queuedBytes = 0;
  private pumping = false;
  private kickScheduled = false;
  private readonly drainWaiters: Array<() => void> = [];
  /** Set when a queue-full failure still has accepted lines ahead of the marker. */
  private readonly warningPlacement = new Map<string, WarningPlacement>();

  constructor(appendLog: EventLogAppend = defaultAppend) {
    this.appendLog = appendLog;
  }

  attach(instances: ProviderInstance[]) {
    for (const instance of instances) {
      this.detach(instance.instanceId);
      const unsub = instance.adapter.onEvent((event) => {
        // hard invariant borrowed from correlateRuntimeEventWithInstance:
        // an adapter may only emit events for its own driver kind
        if (event.provider !== instance.driverKind) {
          console.error(`bus: dropped cross-driver event from ${instance.instanceId}`);
          return;
        }
        this.publish({ ...event, providerInstanceId: instance.instanceId });
      });
      this.unsubscribes.set(instance.instanceId, unsub);
    }
  }

  publish(event: RuntimeEvent) {
    const pending = this.pendingText.get(event.threadId);
    if (event.type === "content.delta") {
      if (pending && sameStream(pending.event, event)) {
        pending.event = { ...pending.event, delta: pending.event.delta + event.delta };
        return;
      }
      if (pending) this.flushThread(event.threadId);
      const timer = setTimeout(() => this.flushThread(event.threadId), DELTA_MERGE_MS);
      timer.unref?.();
      this.pendingText.set(event.threadId, { event, timer });
      return;
    }
    if (pending) this.flushThread(event.threadId);
    this.write(event);
  }

  /** Publish every thread's waiting text now, and wait until the canonical
   * log has accepted every event already queued. Detach and shutdown call
   * this; a terminal event flushes the same queue. */
  flush(): Promise<void> {
    for (const threadId of Array.from(this.pendingText.keys())) this.flushThread(threadId);
    return this.flushDisk();
  }

  /** flush(), bounded for shutdown. Resolves false when the log has not
   * accepted every queued line within `ms`: the caller exits anyway and
   * says the history may be incomplete. */
  async flushWithin(ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      // Not unref'd: the caller is waiting on this answer before it exits.
      timer = setTimeout(() => resolve(false), ms);
    });
    try {
      return await Promise.race([this.flush().then(() => true as const), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private flushThread(threadId: string) {
    const pending = this.pendingText.get(threadId);
    if (!pending) return;
    // gone from the map before delivery: a listener may publish on this thread
    this.pendingText.delete(threadId);
    clearTimeout(pending.timer);
    this.write(pending.event);
  }

  private write(event: RuntimeEvent) {
    // Queue the canonical line first, then deliver. Queueing is synchronous
    // and the append runs later, so a slow disk never stalls the turn, and a
    // listener that publishes from inside delivery queues its event after
    // this one: the log keeps publication order.
    this.enqueue(event);
    this.deliver(event);
    if (isTerminalEvent(event)) void this.flushDisk();
  }

  private enqueue(event: RuntimeEvent) {
    const bytes = Buffer.byteLength(JSON.stringify(redactSecrets(event)));
    const overCount = this.queued.length >= MAX_QUEUED_EVENTS;
    const overBytes = this.queued.length > 0 && this.queuedBytes + bytes > MAX_QUEUED_BYTES;
    if ((overCount || overBytes) && isTerminalEvent(event)) {
      // A turn's end is never dropped: the log and anything that replays it
      // would otherwise show a turn that never finished. If this thread lost
      // lines to the full queue, its marker goes in right before the end.
      if (this.pendingLogWarnings.has(event.threadId) && this.warningPlacement.get(event.threadId) === "after") {
        const warning = this.pendingLogWarnings.get(event.threadId)!;
        this.pendingLogWarnings.delete(event.threadId);
        this.warningPlacement.delete(event.threadId);
        this.push(warning);
      }
      this.push(event);
      return;
    }
    if (overCount || overBytes) {
      // Accepted lines for this thread stay in front of the marker. A thread
      // with nothing queued yet records the marker in front of whatever
      // lands next, same as a failed append.
      const placement: WarningPlacement = this.queued.some((item) => item.event.threadId === event.threadId)
        ? "after"
        : "before";
      this.noteDiskFailure(event, new Error("canonical event log queue is full"), placement);
      return;
    }
    this.push(event, bytes);
  }

  private push(event: RuntimeEvent, bytes = Buffer.byteLength(JSON.stringify(redactSecrets(event)))) {
    this.queued.push({ event, bytes });
    this.queuedBytes += bytes;
    this.kick();
  }

  /** Start a drain on a microtask so a synchronous burst becomes one batch. */
  private kick() {
    if (this.pumping || this.kickScheduled) return;
    this.kickScheduled = true;
    queueMicrotask(() => {
      this.kickScheduled = false;
      if (this.queued.length === 0 || this.pumping) {
        this.settleDrain();
        return;
      }
      this.pumping = true;
      void this.drain().catch((error: unknown) => {
        console.error("bus: canonical event log drain failed", error);
      }).finally(() => {
        this.pumping = false;
        if (this.queued.length > 0) this.kick();
        else this.settleDrain();
      });
    });
  }

  private flushDisk(): Promise<void> {
    if (this.queued.length === 0 && !this.pumping && !this.kickScheduled) return Promise.resolve();
    return new Promise((resolve) => {
      this.drainWaiters.push(resolve);
      this.kick();
    });
  }

  private settleDrain() {
    if (this.queued.length > 0 || this.pumping || this.kickScheduled) return;
    const waiters = this.drainWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private async drain(): Promise<void> {
    if (this.queued.length === 0) return;
    const batch = this.queued.splice(0, MAX_BATCH_LINES);
    let bytes = 0;
    for (const item of batch) bytes += item.bytes;
    this.queuedBytes -= bytes;
    const groups: { threadId: string; events: RuntimeEvent[] }[] = [];
    for (const item of batch) {
      const last = groups.at(-1);
      if (last && last.threadId === item.event.threadId) last.events.push(item.event);
      else groups.push({ threadId: item.event.threadId, events: [item.event] });
    }
    for (const group of groups) await this.appendGroup(group.threadId, group.events);
    if (this.queued.length > 0) await this.drain();
  }

  private async appendGroup(threadId: string, events: RuntimeEvent[]): Promise<void> {
    const warning = this.pendingLogWarnings.get(threadId);
    const placement = this.warningPlacement.get(threadId) ?? "before";
    const moreForThread = this.queued.some((item) => item.event.threadId === threadId);
    const redacted = events.map((event) => redactSecrets(event));
    let wroteWarning = false;
    const persisted: unknown[] = redacted;
    if (warning && placement === "before") {
      persisted.unshift(warning);
      wroteWarning = true;
    } else if (warning && placement === "after" && !moreForThread) {
      persisted.push(warning);
      wroteWarning = true;
    }
    const file = join(EVENTS_DIR, `${threadId}.ndjson`);
    try {
      // the canonical log is a file people paste into bug reports; scrub
      // credential-shaped content (tool titles, request summaries, reply
      // text) the same way the native tee does
      await this.appendLog(file, persisted.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { mode: 0o600 });
      if (wroteWarning) {
        this.pendingLogWarnings.delete(threadId);
        this.warningPlacement.delete(threadId);
      }
      // Best-effort size cap (#1280): an open thread's canonical log
      // otherwise grows without bound for as long as the thread stays open.
      capThreadLog(file, currentThreadLogCap());
    } catch (error) {
      if (placement === "after") this.warningPlacement.set(threadId, "before");
      this.noteDiskFailure(events[0], error, "before");
    }
  }

  /** Once per outage. Never goes back through publish(): that would retry
   * the same failed write and recurse. The marker is written with the next
   * batch that reaches disk. */
  private noteDiskFailure(event: RuntimeEvent, error: unknown, placement: WarningPlacement) {
    if (this.pendingLogWarnings.has(event.threadId)) return;
    const warning: RuntimeEvent = {
      eventId: newId(),
      provider: event.provider,
      providerInstanceId: event.providerInstanceId,
      threadId: event.threadId,
      createdAt: new Date().toISOString(),
      turnId: event.turnId,
      type: "runtime.error",
      message: INCOMPLETE_LOG_MESSAGE,
    };
    this.pendingLogWarnings.set(event.threadId, warning);
    this.warningPlacement.set(event.threadId, placement);
    console.error("bus: canonical event log write failed", error);
    this.deliver(warning);
  }

  private deliver(event: RuntimeEvent) {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      } catch (e) {
        console.error("bus: listener threw", e);
      }
    }
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  detachAll() {
    for (const id of this.unsubscribes.keys()) this.detach(id);
  }

  detach(instanceId: string) {
    this.unsubscribes.get(instanceId)?.();
    this.unsubscribes.delete(instanceId);
    void this.flush();
  }
}
