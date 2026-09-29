import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentProject } from "./models.ts";
import {
  buildProjectGroups,
  deriveLogicalProjectKey,
  derivePhysicalProjectKey,
} from "./projectCatalog.ts";

const repositoryIdentity = {
  canonicalKey: "github.com/example/shared",
  locator: {
    source: "git-remote" as const,
    remoteName: "origin",
    remoteUrl: "https://github.com/example/shared.git",
  },
  rootPath: "/work/shared",
};

function project(
  id: string,
  environmentId: string,
  workspaceRoot: string,
  overrides: Partial<EnvironmentProject> = {},
): EnvironmentProject {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make(environmentId),
    title: id,
    workspaceRoot,
    repositoryIdentity,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("project identity", () => {
  it("keeps repository root and its subdirectories as separate projects", () => {
    const projects = [
      project("root", "local", "/work/shared"),
      project("agi", "local", "/work/shared/agi"),
      project("forge", "local", "/work/shared/forge"),
    ];
    const groups = buildProjectGroups({ projects });

    expect(groups.map((group) => group.label)).toEqual(["root", "agi", "forge"]);
    expect(new Set(groups.map((group) => group.key)).size).toBe(3);
    expect(groups.every((group) => group.members.length === 1)).toBe(true);
  });

  it("keeps the same repository on different environments separate", () => {
    const local = project("local", "local", "/work/shared");
    const remote = project("remote", "PS252", "/work/shared");

    expect(deriveLogicalProjectKey(local)).toBe(derivePhysicalProjectKey(local));
    expect(deriveLogicalProjectKey(remote)).toBe(derivePhysicalProjectKey(remote));
    expect(buildProjectGroups({ projects: [local, remote] })).toHaveLength(2);
  });

  it("keeps directories without Git metadata and retains the newest record for an exact path", () => {
    const old = project("old", "local", "/work/notes", { repositoryIdentity: null });
    const current = project("current", "local", "/work/notes/", {
      title: "Notes",
      repositoryIdentity: null,
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    const groups = buildProjectGroups({ projects: [old, current] });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Notes");
    expect(groups[0]?.representative.id).toBe(current.id);
    expect(groups[0]?.memberProjectRefs).toHaveLength(2);
  });
});
