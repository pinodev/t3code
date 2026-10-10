import {
  DEFAULT_SERVER_SETTINGS,
  DEFAULT_UNIFIED_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";
import { getBackgroundActivityPresetSettings } from "@t3tools/shared/backgroundActivitySettings";
import * as Duration from "effect/Duration";
import { describe, expect, it } from "vite-plus/test";
import {
  backgroundActivitySharedPolicySettings,
  buildProviderInstanceUpdatePatch,
  formatDiagnosticsDescription,
  getChangedBrowserSettingLabels,
  getChangedTypographySettingLabels,
  hasChangedBackgroundActivitySettings,
  resolveBackgroundActivityProfileOption,
  resolveAutoSettleDraftCommit,
  resolveAutoSettleDraftPatch,
} from "./SettingsPanels.logic";

describe("typography settings restore", () => {
  it("detects family and size changes by font row", () => {
    expect(getChangedTypographySettingLabels(DEFAULT_UNIFIED_SETTINGS)).toEqual([]);
    expect(
      getChangedTypographySettingLabels({
        ...DEFAULT_UNIFIED_SETTINGS,
        fontSizeInterface: 18,
        fontFamilyCode: "Fira Code",
      }),
    ).toEqual(["Interface font", "Code font"]);
  });
});

describe("background activity settings restore", () => {
  it("detects legacy interval values even when the structured setting is at its default", () => {
    expect(
      hasChangedBackgroundActivitySettings({
        backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
        backgroundActivityProfile: DEFAULT_UNIFIED_SETTINGS.backgroundActivityProfile,
        automaticGitFetchInterval: Duration.seconds(45),
        providerHealthRefreshInterval: DEFAULT_UNIFIED_SETTINGS.providerHealthRefreshInterval,
      }),
    ).toBe(true);
    expect(
      hasChangedBackgroundActivitySettings({
        backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
        backgroundActivityProfile: DEFAULT_UNIFIED_SETTINGS.backgroundActivityProfile,
        automaticGitFetchInterval: DEFAULT_UNIFIED_SETTINGS.automaticGitFetchInterval,
        providerHealthRefreshInterval: Duration.minutes(7),
      }),
    ).toBe(true);
    expect(hasChangedBackgroundActivitySettings(DEFAULT_UNIFIED_SETTINGS)).toBe(false);
  });

  it("detects a legacy profile override so restoring defaults clears it", () => {
    expect(
      hasChangedBackgroundActivitySettings({
        ...DEFAULT_UNIFIED_SETTINGS,
        backgroundActivityProfile: "performance",
      }),
    ).toBe(true);
  });

  it("shows the effective legacy preset and marks custom legacy intervals as advanced", () => {
    const performance = getBackgroundActivityPresetSettings("performance");
    expect(
      resolveBackgroundActivityProfileOption({
        ...DEFAULT_UNIFIED_SETTINGS,
        backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
        backgroundActivityProfile: "performance",
        automaticGitFetchInterval: performance.automaticGitFetchInterval,
        providerHealthRefreshInterval: performance.providerHealthRefreshInterval,
      }),
    ).toBe("performance");

    expect(
      resolveBackgroundActivityProfileOption({
        ...DEFAULT_UNIFIED_SETTINGS,
        backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
        backgroundActivityProfile: "performance",
        automaticGitFetchInterval: Duration.seconds(45),
        providerHealthRefreshInterval: Duration.minutes(7),
      }),
    ).toBe("advanced");
  });

  it("preserves advanced overrides when the shared policy changes", () => {
    const automaticGitFetchInterval = Duration.seconds(42);
    expect(
      backgroundActivitySharedPolicySettings(
        {
          ...DEFAULT_UNIFIED_SETTINGS,
          backgroundActivity: {
            schemaVersion: 1,
            profile: "custom",
            baseProfile: "balanced",
            overrides: {
              automaticGitFetchInterval,
              pauseWhenOnBattery: true,
            },
          },
        },
        "performance",
      ),
    ).toEqual({
      schemaVersion: 1,
      profile: "custom",
      baseProfile: "performance",
      overrides: {
        automaticGitFetchInterval,
        pauseWhenOnBattery: true,
      },
    });
  });

  it("materializes legacy advanced overrides before changing the shared policy", () => {
    const automaticGitFetchInterval = Duration.seconds(42);
    expect(
      backgroundActivitySharedPolicySettings(
        {
          ...DEFAULT_UNIFIED_SETTINGS,
          automaticGitFetchInterval,
        },
        "battery-saver",
      ),
    ).toEqual({
      schemaVersion: 1,
      profile: "custom",
      baseProfile: "battery-saver",
      overrides: {
        automaticGitFetchInterval,
      },
    });
  });
});

describe("formatDiagnosticsDescription", () => {
  it("collapses trace and metric URLs that share the same OTEL base path", () => {
    expect(
      formatDiagnosticsDescription({
        localTracingEnabled: true,
        otlpTracesEnabled: true,
        otlpTracesUrl: "http://localhost:4318/v1/traces",
        otlpMetricsEnabled: true,
        otlpMetricsUrl: "http://localhost:4318/v1/metrics",
      }),
    ).toBe("Local trace file. Exporting OTEL to http://localhost:4318/v1/{traces,metrics}.");
  });

  it("keeps separate trace and metric URLs when their base paths differ", () => {
    expect(
      formatDiagnosticsDescription({
        localTracingEnabled: true,
        otlpTracesEnabled: true,
        otlpTracesUrl: "http://localhost:4318/v1/traces",
        otlpMetricsEnabled: true,
        otlpMetricsUrl: "http://localhost:9000/v1/metrics",
      }),
    ).toBe(
      "Local trace file. Exporting OTEL traces to http://localhost:4318/v1/traces and metrics to http://localhost:9000/v1/metrics.",
    );
  });

  it("omits OTEL text when no exporter is enabled", () => {
    expect(
      formatDiagnosticsDescription({
        localTracingEnabled: true,
        otlpTracesEnabled: false,
        otlpMetricsEnabled: false,
      }),
    ).toBe("Local trace file.");
  });
});

describe("buildProviderInstanceUpdatePatch", () => {
  it("promotes an edited default provider into providerInstances and resets the legacy provider", () => {
    const instanceId = ProviderInstanceId.make("codex");
    const nextInstance = {
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      config: {
        binaryPath: "/opt/t3/codex",
      },
    } satisfies ProviderInstanceConfig;

    const patch = buildProviderInstanceUpdatePatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providers: {
          ...DEFAULT_SERVER_SETTINGS.providers,
          codex: {
            ...DEFAULT_SERVER_SETTINGS.providers.codex,
            binaryPath: "/legacy/codex",
          },
        },
      },
      instanceId,
      instance: nextInstance,
      driver: ProviderDriverKind.make("codex"),
      isDefault: true,
    });

    expect(patch.providerInstances?.[instanceId]).toEqual(nextInstance);
    expect(patch.providers?.codex).toEqual(DEFAULT_SERVER_SETTINGS.providers.codex);
  });

  it("updates custom instances without touching legacy provider settings", () => {
    const instanceId = ProviderInstanceId.make("codex_personal");
    const nextInstance = {
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      config: {
        homePath: "/Users/example/.codex-personal",
      },
    } satisfies ProviderInstanceConfig;

    const patch = buildProviderInstanceUpdatePatch({
      settings: DEFAULT_SERVER_SETTINGS,
      instanceId,
      instance: nextInstance,
      driver: ProviderDriverKind.make("codex"),
      isDefault: false,
    });

    expect(patch.providerInstances?.[instanceId]).toEqual(nextInstance);
    expect(patch.providers).toBeUndefined();
  });
});

describe("getChangedBrowserSettingLabels", () => {
  it("reports nothing for the defaults", () => {
    expect(getChangedBrowserSettingLabels(DEFAULT_UNIFIED_SETTINGS)).toEqual([]);
  });

  it("treats a structurally equal viewport as unchanged", () => {
    // The viewport is a tagged union, so identity comparison would report a
    // freshly decoded copy of the default as dirty and offer to "restore" it.
    expect(
      getChangedBrowserSettingLabels({
        ...DEFAULT_UNIFIED_SETTINGS,
        browserDefaultViewport: { ...DEFAULT_UNIFIED_SETTINGS.browserDefaultViewport },
      }),
    ).toEqual([]);
  });

  it("labels each browser default that differs", () => {
    expect(
      getChangedBrowserSettingLabels({
        ...DEFAULT_UNIFIED_SETTINGS,
        browserDefaultViewport: { _tag: "freeform", width: 900, height: 600 },
        browserDefaultZoomFactor: 1.5,
        browserDefaultAppearance: "dark",
        browserRecordingFrameRate: 60,
        browserLinkTarget: "app",
        browserAutoShowFloatingPreview: !DEFAULT_UNIFIED_SETTINGS.browserAutoShowFloatingPreview,
      }),
    ).toEqual([
      "Browser viewport",
      "Browser zoom",
      "Browser appearance",
      "Recording frame rate",
      "Open links in",
      "Floating preview",
    ]);
  });
});

describe("resolveAutoSettleDraftCommit", () => {
  const threeDays = 3 * 1440;

  it("saves a finished draft as minutes in its unit", () => {
    expect(resolveAutoSettleDraftCommit("15", "minutes", threeDays)).toBe(15);
    expect(resolveAutoSettleDraftCommit("60", "minutes", threeDays)).toBe(60);
    expect(resolveAutoSettleDraftCommit("1", "hours", threeDays)).toBe(60);
    expect(resolveAutoSettleDraftCommit("90", "minutes", threeDays)).toBe(90);
    expect(resolveAutoSettleDraftCommit(" 2 ", "days", threeDays)).toBe(2880);
  });

  it("keeps the current value for unchanged, empty, fractional or out-of-range drafts", () => {
    expect(resolveAutoSettleDraftCommit("3", "days", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("72", "hours", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("", "minutes", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("  ", "minutes", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("3.5", "hours", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("abc", "hours", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("0", "minutes", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("-5", "minutes", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("91", "days", threeDays)).toBeNull();
    expect(resolveAutoSettleDraftCommit("129601", "minutes", threeDays)).toBeNull();
  });
});

describe("resolveAutoSettleDraftPatch", () => {
  const threeDays = 3 * 1440;

  it("stores sub-day thresholds in minutes and leaves days untouched", () => {
    expect(resolveAutoSettleDraftPatch("60", "minutes", threeDays)).toEqual({
      sidebarAutoSettleAfterMinutes: 60,
    });
    expect(resolveAutoSettleDraftPatch("36", "hours", threeDays)).toEqual({
      sidebarAutoSettleAfterMinutes: 2160,
    });
  });

  it("stores whole days in the days key and clears minutes", () => {
    expect(resolveAutoSettleDraftPatch("2", "days", threeDays)).toEqual({
      sidebarAutoSettleAfterDays: 2,
      sidebarAutoSettleAfterMinutes: null,
    });
    expect(resolveAutoSettleDraftPatch("48", "hours", 60)).toEqual({
      sidebarAutoSettleAfterDays: 2,
      sidebarAutoSettleAfterMinutes: null,
    });
  });

  it("writes nothing when the draft does not change the threshold", () => {
    expect(resolveAutoSettleDraftPatch("1", "hours", 60)).toBeNull();
    expect(resolveAutoSettleDraftPatch("", "days", 60)).toBeNull();
  });
});
