import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveThreadWorkspaceCwd } from "./Utils.ts";

const projectId = ProjectId.make("project");

describe("resolveThreadWorkspaceCwd", () => {
  it("uses the project's nested directory inside a worktree", () => {
    expect(
      resolveThreadWorkspaceCwd({
        thread: { projectId, worktreePath: "D:\\worktrees\\feature" },
        projects: [
          {
            id: projectId,
            workspaceRoot: "C:\\kdb\\agi",
            repositoryIdentity: { rootPath: "C:\\kdb" },
          },
        ],
      }),
    ).toBe("D:\\worktrees\\feature\\agi");
  });

  it("uses a non-Git project's own directory for local threads", () => {
    expect(
      resolveThreadWorkspaceCwd({
        thread: { projectId, worktreePath: null },
        projects: [{ id: projectId, workspaceRoot: "C:\\notes", repositoryIdentity: null }],
      }),
    ).toBe("C:\\notes");
  });
});
