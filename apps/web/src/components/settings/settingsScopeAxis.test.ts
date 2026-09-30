import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  environmentAxisValue,
  projectAxisValue,
  projectsForEnvironment,
  selectEnvironmentAxis,
  selectProjectAxis,
  settingsScopeEnvironmentLabel,
} from "./settingsScopeAxis";

const first = {
  environmentId: EnvironmentId.make("first"),
  label: "Development",
  displayUrl: "https://first.example.com",
};
const second = {
  environmentId: EnvironmentId.make("second"),
  label: "Development",
  displayUrl: "https://second.example.com",
};

describe("settings scope environment labels", () => {
  it("distinguishes same-name environments by address", () => {
    const environments = [first, second];
    expect(
      environments.map((environment) => settingsScopeEnvironmentLabel(environment, environments)),
    ).toEqual([
      "Development · https://first.example.com",
      "Development · https://second.example.com",
    ]);
  });

  it("falls back to environment IDs when duplicate names have no display URL", () => {
    const environments = [first, second].map((environment) => ({
      ...environment,
      displayUrl: null,
    }));
    expect(
      environments.map((environment) => settingsScopeEnvironmentLabel(environment, environments)),
    ).toEqual(["Development · first", "Development · second"]);
  });

  it("keeps unique names compact and removes disambiguation after a rename", () => {
    expect(settingsScopeEnvironmentLabel(first, [first])).toBe("Development");
    expect(settingsScopeEnvironmentLabel(first, [first, { ...second, label: "Production" }])).toBe(
      "Development",
    );
  });
});

describe("settings scope axes", () => {
  it("maps each axis to its search key and back", () => {
    expect(projectAxisValue({})).toBe("all");
    expect(projectAxisValue({ project: "app" })).toBe("app");
    expect(selectProjectAxis({ machine: "second" }, "app")).toEqual({
      project: "app",
      machine: "second",
    });
    expect(selectProjectAxis({ machine: "second", project: "app" }, "all")).toEqual({
      machine: "second",
    });
    expect(selectEnvironmentAxis({ project: "app" }, "first")).toEqual({
      machine: "first",
    });
    expect(selectEnvironmentAxis({ project: "app", machine: "first" }, "all")).toEqual({});
    expect(selectProjectAxis({ machine: "second" }, "app", "first")).toEqual({
      project: "app",
      machine: "first",
    });
  });

  it("drops a checkout narrowing from older links when either axis changes", () => {
    const checkout = { project: "app", checkout: "app@first", machine: "first" };
    expect(selectEnvironmentAxis(checkout, "second")).toEqual({
      machine: "second",
    });
    expect(selectProjectAxis(checkout, "app")).toEqual({ project: "app", machine: "first" });
  });
});

describe("projectsForEnvironment", () => {
  const groups = [
    { projectKey: "ps26-project", environmentId: "ps26" },
    { projectKey: "ps252-project", environmentId: "ps252" },
  ];

  it("shows only projects on the selected computer", () => {
    expect(projectsForEnvironment(groups, "ps252")).toEqual([groups[1]]);
    expect(projectsForEnvironment(groups, undefined)).toEqual(groups);
  });
});

describe("environmentAxisValue", () => {
  it("shows the checkout's environment for a legacy checkout link", () => {
    expect(environmentAxisValue({ project: "p", checkout: "c" }, "laptop")).toBe("laptop");
    expect(environmentAxisValue({ project: "p" }, null)).toBe("all");
    expect(environmentAxisValue({ machine: "desk" }, "laptop")).toBe("desk");
  });
});
