import type { LegendListRef } from "@legendapp/list/react";
import type { TurnId } from "@t3tools/contracts";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  findMarkdownFragmentElement,
  findMarkdownHeadingMessageId,
  normalizeMarkdownFragment,
} from "../../markdown-heading-anchors";
import type { TimelineEntry } from "../../session-logic";
import type { MarkdownHeadingNavigator } from "../ChatMarkdown";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

/** A heading fragment from the thread URL. `key` changes with each navigation. */
export interface MarkdownHeadingRequest {
  readonly fragment: string;
  readonly key: string;
}

const HEADING_VIEW_OFFSET = 24;

/**
 * Scrolls the timeline to a markdown heading, mounting its message row first when it was
 * virtualized away or folded. Message texts are only scanned when a fragment is followed,
 * never while messages stream.
 */
export function useMarkdownHeadingNavigation({
  request,
  entries,
  rows,
  listRef,
  historyLoading,
  onExpandTurn,
  onManualNavigation,
}: {
  request: MarkdownHeadingRequest | null;
  entries: ReadonlyArray<TimelineEntry>;
  rows: ReadonlyArray<MessagesTimelineRow>;
  listRef: RefObject<LegendListRef | null>;
  historyLoading: boolean;
  onExpandTurn: (turnId: TurnId) => void;
  onManualNavigation: () => void;
}) {
  const [listLoaded, setListLoaded] = useState(false);
  const onListLoad = useCallback(() => setListLoaded(true), []);
  // A committed-state mirror keeps the navigator stable: every markdown link reads it from
  // context, and a new identity per streamed token would re-render all of them.
  const stateRef = useRef({ entries, rows, onExpandTurn, onManualNavigation });
  useLayoutEffect(() => {
    stateRef.current = { entries, rows, onExpandTurn, onManualNavigation };
  });
  const pendingRef = useRef<{ messageId: string; fragment: string } | null>(null);

  const reveal = useCallback(
    (messageId: string, fragment: string) => {
      const index = stateRef.current.rows.findIndex(
        (row) => row.kind === "message" && row.message.id === messageId,
      );
      const list = listRef.current;
      const rowId = stateRef.current.rows[index]?.id;
      if (!list || rowId === undefined) return false;
      void list
        .scrollToIndex({ index, animated: false, viewOffset: HEADING_VIEW_OFFSET })
        .then(() => {
          // The row is mounted once the list has scrolled to it; align the heading itself.
          requestAnimationFrame(() => {
            const scrollNode = list.getScrollableNode() as HTMLElement | null;
            const row = scrollNode?.querySelector(`[data-timeline-row-id="${CSS.escape(rowId)}"]`);
            const heading = row ? findMarkdownFragmentElement(row, fragment) : null;
            if (!scrollNode || !heading) return;
            const offset =
              list.getState().scroll +
              heading.getBoundingClientRect().top -
              scrollNode.getBoundingClientRect().top -
              HEADING_VIEW_OFFSET;
            void list.scrollToOffset({ offset: Math.max(0, offset), animated: false });
          });
        });
      return true;
    },
    [listRef],
  );

  const navigate = useCallback<MarkdownHeadingNavigator>(
    (fragment, sourceMessageId) => {
      const { entries: currentEntries, onExpandTurn: expandTurn } = stateRef.current;
      const messages = currentEntries.flatMap((entry) =>
        entry.kind === "message" ? [entry.message] : [],
      );
      const messageId = findMarkdownHeadingMessageId(messages, fragment, sourceMessageId);
      if (messageId === null) return false;
      stateRef.current.onManualNavigation();
      pendingRef.current = null;
      if (reveal(messageId, fragment)) return true;
      // A folded turn hides its intermediate messages; unfold it and reveal once it renders.
      const turnId = messages.find((message) => message.id === messageId)?.turnId;
      if (!turnId) return false;
      pendingRef.current = { messageId, fragment };
      expandTurn(turnId);
      return true;
    },
    [reveal],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (!rows.some((row) => row.kind === "message" && row.message.id === pending.messageId)) {
      return;
    }
    pendingRef.current = null;
    reveal(pending.messageId, pending.fragment);
  }, [reveal, rows]);

  // A followed link pushes its own hash, which comes back as a request. The link already
  // chose the message, so that request must not move to another one.
  const linkFragmentRef = useRef<string | null>(null);
  const navigateFromLink = useCallback<MarkdownHeadingNavigator>(
    (fragment, sourceMessageId) => {
      const navigated = navigate(fragment, sourceMessageId);
      // Following the current hash again changes no URL, so no request follows.
      linkFragmentRef.current =
        navigated && window.location.hash !== fragment ? normalizeMarkdownFragment(fragment) : null;
      return navigated;
    },
    [navigate],
  );

  const handledRequestKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!request || handledRequestKeyRef.current === request.key) return;
    const linkFragment = linkFragmentRef.current;
    linkFragmentRef.current = null;
    if (linkFragment === normalizeMarkdownFragment(request.fragment)) {
      handledRequestKeyRef.current = request.key;
      return;
    }
    if (!listLoaded || historyLoading || rows.length === 0) return;
    // ChatView pins a newly opened thread to its end on the next frame. Reveal after it.
    const frame = requestAnimationFrame(() => {
      handledRequestKeyRef.current = request.key;
      navigate(request.fragment, null);
    });
    return () => cancelAnimationFrame(frame);
  }, [historyLoading, listLoaded, navigate, request, rows.length]);

  return { navigate: navigateFromLink, onListLoad };
}
