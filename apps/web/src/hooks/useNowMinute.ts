import { useSyncExternalStore } from "react";

/** Minute-quantized UI clock ("YYYY-MM-DDTHH:MM"). One module-level timer
    feeds every consumer through useSyncExternalStore. */

function currentMinute(): string {
  return new Date().toISOString().slice(0, 16);
}

let nowMinute = currentMinute();
let timerId: number | null = null;
let timerIsInterval = false;
const listeners = new Set<() => void>();

function tick(): void {
  const next = currentMinute();
  if (next !== nowMinute) {
    nowMinute = next;
    for (const listener of listeners) listener();
  }
}

function startTimer(): void {
  // Align to the next UTC minute boundary, then tick every 60s. Ticks re-read
  // the clock, so a throttled or late timer self-corrects when it fires.
  timerIsInterval = false;
  timerId = window.setTimeout(
    () => {
      tick();
      timerIsInterval = true;
      timerId = window.setInterval(tick, 60_000);
    },
    60_000 - (Date.now() % 60_000),
  );
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    startTimer();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timerId !== null) {
      if (timerIsInterval) window.clearInterval(timerId);
      else window.clearTimeout(timerId);
      timerId = null;
    }
  };
}

function getSnapshot(): string {
  // With no timer running (no subscribers yet — e.g. the first render after
  // a full unmount), the stored minute may be stale; re-read it so a fresh
  // mount renders the current minute instead of waiting for the first tick.
  // While the timer runs the cached value is returned untouched, as
  // useSyncExternalStore requires between change notifications.
  if (timerId === null) {
    nowMinute = currentMinute();
  }
  return nowMinute;
}

export function useNowMinute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const subscribeNever = () => () => {};

/** True once `minutes` have passed since `since`, on the same minute clock.
    The caller re-renders only when the answer flips; a null timestamp or a
    non-positive duration never elapses and never subscribes. */
export function useMinutesElapsed(since: string | null | undefined, minutes: number): boolean {
  const start = since == null || minutes <= 0 ? Number.NaN : Date.parse(since);
  const deadline = start + minutes * 60_000;
  const elapsed = () => !Number.isNaN(deadline) && Date.parse(`${getSnapshot()}:00Z`) >= deadline;
  return useSyncExternalStore(
    Number.isNaN(deadline) ? subscribeNever : subscribe,
    elapsed,
    elapsed,
  );
}
