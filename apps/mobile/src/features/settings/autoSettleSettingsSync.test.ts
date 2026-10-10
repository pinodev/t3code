import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { planAutoSettleSettingsSync, resolveAutoSettleAmountPatch } from "./autoSettleSettingsSync";

const reference = {
  environmentId: EnvironmentId.make("reference"),
  settings: {
    ...DEFAULT_SERVER_SETTINGS,
    sidebarAutoSettleAfterDays: 7,
    sidebarAutoSettleOnMerge: true,
    newWorktreesStartFromOrigin: false,
    continueThreadsAfterServerUpdate: false,
  },
};

describe("auto-settle settings sync", () => {
  it("ignores differences in independently configured environment settings", () => {
    const target = {
      environmentId: EnvironmentId.make("remote"),
      label: "Remote",
      settings: {
        ...reference.settings,
        newWorktreesStartFromOrigin: true,
        continueThreadsAfterServerUpdate: true,
        sourceControlWritingStyle: {
          ...reference.settings.sourceControlWritingStyle,
          customInstructions: "Keep this environment's writing instructions.",
        },
      },
    };

    const plan = planAutoSettleSettingsSync(reference, [target]);

    expect(plan.mismatches).toEqual([]);
    expect(plan.patch).toEqual({
      sidebarAutoSettleAfterDays: 7,
      sidebarAutoSettleAfterMinutes: null,
      sidebarAutoSettleOnMerge: true,
    });
  });

  it("applies only auto-settle defaults when another environment differs", () => {
    const target = {
      environmentId: EnvironmentId.make("remote"),
      label: "Remote",
      settings: {
        ...reference.settings,
        sidebarAutoSettleAfterDays: null,
        sidebarAutoSettleOnMerge: false,
        newWorktreesStartFromOrigin: true,
        continueThreadsAfterServerUpdate: true,
        sourceControlWritingStyle: {
          ...reference.settings.sourceControlWritingStyle,
          customInstructions: "Preserve these instructions.",
        },
      },
    };

    const plan = planAutoSettleSettingsSync(reference, [target]);
    const updated = { ...target.settings, ...plan.patch };

    expect(plan.mismatches).toEqual([target]);
    expect(updated.sidebarAutoSettleAfterDays).toBe(7);
    expect(updated.sidebarAutoSettleOnMerge).toBe(true);
    expect(updated.newWorktreesStartFromOrigin).toBe(true);
    expect(updated.continueThreadsAfterServerUpdate).toBe(true);
    expect(updated.sourceControlWritingStyle).toEqual(target.settings.sourceControlWritingStyle);
  });

  it("does not compare the reference or a target without loaded settings", () => {
    const plan = planAutoSettleSettingsSync(reference, [
      { ...reference, label: "Reference" },
      { environmentId: EnvironmentId.make("loading"), label: "Loading", settings: null },
    ]);

    expect(plan.mismatches).toEqual([]);
  });

  it("carries the minutes threshold and compares what it resolves to", () => {
    const hourly = {
      ...reference,
      settings: {
        ...reference.settings,
        sidebarAutoSettleAfterDays: 1,
        sidebarAutoSettleAfterMinutes: 60,
      },
    };
    const sameHour = {
      environmentId: EnvironmentId.make("same"),
      label: "Same",
      settings: { ...hourly.settings },
    };
    const wholeDay = {
      environmentId: EnvironmentId.make("day"),
      label: "Day",
      settings: { ...hourly.settings, sidebarAutoSettleAfterMinutes: null },
    };

    const plan = planAutoSettleSettingsSync(hourly, [sameHour, wholeDay]);

    expect(plan.patch).toEqual({
      sidebarAutoSettleAfterDays: 1,
      sidebarAutoSettleAfterMinutes: 60,
      sidebarAutoSettleOnMerge: true,
    });
    expect(plan.mismatches).toEqual([wholeDay]);
  });

  it("ignores an unused minutes value while auto-settle is off on both", () => {
    const off = {
      ...reference,
      settings: { ...reference.settings, sidebarAutoSettleAfterDays: null },
    };
    const offWithStaleMinutes = {
      environmentId: EnvironmentId.make("stale"),
      label: "Stale",
      settings: { ...off.settings, sidebarAutoSettleAfterMinutes: 30 },
    };

    expect(planAutoSettleSettingsSync(off, [offWithStaleMinutes]).mismatches).toEqual([]);
  });
});

describe("auto-settle amount patch", () => {
  const threeDays = 3 * 1440;

  it("stores sub-day amounts in minutes and leaves days untouched", () => {
    expect(resolveAutoSettleAmountPatch("60", "minutes", threeDays)).toEqual({
      sidebarAutoSettleAfterMinutes: 60,
    });
    expect(resolveAutoSettleAmountPatch("90", "minutes", threeDays)).toEqual({
      sidebarAutoSettleAfterMinutes: 90,
    });
  });

  it("stores whole days in the days key and clears minutes", () => {
    expect(resolveAutoSettleAmountPatch(" 2 ", "days", threeDays)).toEqual({
      sidebarAutoSettleAfterDays: 2,
      sidebarAutoSettleAfterMinutes: null,
    });
    expect(resolveAutoSettleAmountPatch("24", "hours", 60)).toEqual({
      sidebarAutoSettleAfterDays: 1,
      sidebarAutoSettleAfterMinutes: null,
    });
  });

  it("keeps the current value for unchanged, empty, fractional or out-of-range drafts", () => {
    expect(resolveAutoSettleAmountPatch("3", "days", threeDays)).toBeNull();
    expect(resolveAutoSettleAmountPatch("", "minutes", threeDays)).toBeNull();
    expect(resolveAutoSettleAmountPatch("3.5", "hours", threeDays)).toBeNull();
    expect(resolveAutoSettleAmountPatch("3days", "days", threeDays)).toBeNull();
    expect(resolveAutoSettleAmountPatch("0", "minutes", threeDays)).toBeNull();
    expect(resolveAutoSettleAmountPatch("91", "days", threeDays)).toBeNull();
  });
});
