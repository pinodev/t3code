import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { derivePhysicalProjectKey } from "./logicalProject";
import {
  buildSidebarProjectPickerEntries,
  buildSidebarProjectSnapshots,
} from "./sidebarProjectCatalog";
import type { Project } from "./types";

const primaryEnvironmentId = EnvironmentId.make("local");
const remoteEnvironmentId = EnvironmentId.make("PS252");
const repositoryIdentity = {
  canonicalKey: "github.com/example/shared",
  locator: {
    source: "git-remote" as const,
    remoteName: "origin",
    remoteUrl: "https://github.com/example/shared.git",
  },
  rootPath: "/work/shared",
};

function project(id: string, environmentId: EnvironmentId, workspaceRoot: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId,
    title: id,
    workspaceRoot,
    repositoryIdentity,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5-codex",
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("sidebar project catalog", () => {
  const projects = [
    project("shared", primaryEnvironmentId, "/work/shared"),
    project("agi", primaryEnvironmentId, "/work/shared/agi"),
    project("forge", primaryEnvironmentId, "/work/shared/forge"),
    project("remote-agi", remoteEnvironmentId, "/work/shared/agi"),
  ];

  it("keeps each workspace and environment distinct despite a shared Git remote", () => {
    const snapshots = buildSidebarProjectSnapshots({
      projects,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (id) => id,
    });

    expect(snapshots).toHaveLength(4);
    expect(snapshots.map((snapshot) => snapshot.displayName)).toEqual([
      "shared",
      "agi",
      "forge",
      "remote-agi",
    ]);
    expect(snapshots.every((snapshot) => snapshot.memberProjects.length === 1)).toBe(true);
    expect(snapshots[3]?.memberProjects[0]?.environmentLabel).toBe("PS252");
  });

  it("routes project pickers to their exact workspace", () => {
    const snapshots = buildSidebarProjectSnapshots({
      projects,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (id) => id,
    });
    const entries = buildSidebarProjectPickerEntries({
      groups: snapshots,
      preferredProjectRef: {
        environmentId: remoteEnvironmentId,
        projectId: projects[3]!.id,
      },
    });

    expect(entries[0]?.targetProject.workspaceRoot).toBe("/work/shared/agi");
    expect(entries[0]?.targetProject.environmentId).toBe(remoteEnvironmentId);
    expect(new Set(projects.map(derivePhysicalProjectKey)).size).toBe(4);
  });
});
