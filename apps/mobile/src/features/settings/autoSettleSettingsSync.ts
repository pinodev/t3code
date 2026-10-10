import {
  type AutoSettleUnit,
  autoSettleAfterMinutesPatch,
  type EnvironmentId,
  joinAutoSettleAfterMinutes,
  resolveAutoSettleAfterMinutes,
  type ServerSettings,
} from "@t3tools/contracts";

export type AutoSettleSettings = Pick<
  ServerSettings,
  "sidebarAutoSettleAfterDays" | "sidebarAutoSettleAfterMinutes" | "sidebarAutoSettleOnMerge"
>;

interface AutoSettleSyncTarget {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly settings: AutoSettleSettings | null;
}

/** Receives connected, capable targets. Applying these defaults must preserve other settings. */
export function planAutoSettleSettingsSync(
  reference: { readonly environmentId: EnvironmentId; readonly settings: AutoSettleSettings },
  targets: readonly AutoSettleSyncTarget[],
) {
  const patch: AutoSettleSettings = {
    sidebarAutoSettleAfterDays: reference.settings.sidebarAutoSettleAfterDays,
    sidebarAutoSettleAfterMinutes: reference.settings.sidebarAutoSettleAfterMinutes ?? null,
    sidebarAutoSettleOnMerge: reference.settings.sidebarAutoSettleOnMerge,
  };
  const referenceMinutes = resolveAutoSettleAfterMinutes(patch);
  // Days are compared on their own because older readers use only them; the
  // minutes are compared as resolved, so an unused minutes value is no mismatch.
  const mismatches = targets.filter(
    (target) =>
      target.environmentId !== reference.environmentId &&
      target.settings !== null &&
      (target.settings.sidebarAutoSettleAfterDays !== patch.sidebarAutoSettleAfterDays ||
        resolveAutoSettleAfterMinutes(target.settings) !== referenceMinutes ||
        target.settings.sidebarAutoSettleOnMerge !== patch.sidebarAutoSettleOnMerge),
  );
  return { patch, mismatches };
}

/**
 * The patch a finished amount draft in `unit` saves, or null to keep the current
 * threshold. Whole days go to the days key; finer values only touch minutes.
 */
export function resolveAutoSettleAmountPatch(
  draft: string,
  unit: AutoSettleUnit,
  currentMinutes: number,
): ReturnType<typeof autoSettleAfterMinutesPatch> | null {
  const trimmed = draft.trim();
  // Whole-string check so "3.5" and "3days" are rejected instead of
  // silently becoming 3 on every eligible sync target.
  const minutes = /^\d+$/.test(trimmed) ? joinAutoSettleAfterMinutes(Number(trimmed), unit) : null;
  return minutes === null || minutes === currentMinutes
    ? null
    : autoSettleAfterMinutesPatch(minutes);
}
