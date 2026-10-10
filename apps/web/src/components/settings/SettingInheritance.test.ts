import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { describe, expect, it } from "vite-plus/test";

import { settingInheritanceLayers } from "./SettingInheritance";

const environmentId = EnvironmentId.make("laptop");
const projectId = ProjectId.make("project");

describe("settingInheritanceLayers", () => {
  it("marks the built-in default effective when nothing is set", () => {
    const resolved = resolveProjectSettings(DEFAULT_SERVER_SETTINGS, null);
    const layers = settingInheritanceLayers(
      { environmentId, label: "Laptop", projectId: null, ...resolved },
      DEFAULT_SERVER_SETTINGS,
      "defaultAutoPull",
    );
    expect(layers.map((layer) => [layer.label, layer.value, layer.effective])).toEqual([
      ["Laptop", "Inherits", false],
      ["Default", "Off", true],
    ]);
  });

  it("walks project override, environment value, then built-in default", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      defaultAutoPull: true,
      projectSettingsOverrides: { [projectId]: { defaultAutoPull: false } },
    };
    const resolved = resolveProjectSettings(settings, projectId);
    const layers = settingInheritanceLayers(
      { environmentId, label: "Laptop", projectId, ...resolved },
      settings,
      "defaultAutoPull",
    );
    expect(layers.map((layer) => [layer.label, layer.value, layer.effective])).toEqual([
      ["Project", "Off", true],
      ["Laptop", "On", false],
      ["Default", "Off", false],
    ]);
    const inherited = settingInheritanceLayers(
      {
        environmentId,
        label: "Laptop",
        projectId,
        ...resolveProjectSettings(settings, ProjectId.make("other")),
      },
      settings,
      "defaultAutoPull",
    );
    expect(inherited.map((layer) => [layer.value, layer.effective])).toEqual([
      ["Inherits", false],
      ["On", true],
      ["Off", false],
    ]);
  });
});

describe("auto-settle inheritance", () => {
  it("shows the threshold the days and minutes keys resolve to", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      sidebarAutoSettleAfterMinutes: 60,
      projectSettingsOverrides: { [projectId]: { sidebarAutoSettleAfterMinutes: 90 } },
    };
    const layers = settingInheritanceLayers(
      { environmentId, label: "Laptop", projectId, ...resolveProjectSettings(settings, projectId) },
      settings,
      "sidebarAutoSettleAfterDays",
    );
    expect(layers.map((layer) => [layer.label, layer.value, layer.effective])).toEqual([
      ["Project", "90 minutes", true],
      ["Laptop", "1 hour", false],
      ["Default", "3 days", false],
    ]);
  });

  it("lets project days win over minutes inherited from the environment", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      sidebarAutoSettleAfterMinutes: 60,
      projectSettingsOverrides: { [projectId]: { sidebarAutoSettleAfterDays: 2 } },
    };
    const layers = settingInheritanceLayers(
      { environmentId, label: "Laptop", projectId, ...resolveProjectSettings(settings, projectId) },
      settings,
      "sidebarAutoSettleAfterDays",
    );
    expect(layers.map((layer) => layer.value)).toEqual(["2 days", "1 hour", "3 days"]);
  });
});
