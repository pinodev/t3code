import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";

import { projectComputerLabel, type SidebarProjectSnapshot } from "~/sidebarProjectCatalog";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";

export function ProjectEnvironmentBadge(props: {
  readonly group: Pick<SidebarProjectSnapshot, "memberProjects">;
  readonly machineByEnvironmentId: ReadonlyMap<EnvironmentId, EnvironmentMachineKind>;
}) {
  const member = props.group.memberProjects[0];
  if (!member) return null;
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <EnvironmentMachineIcon
        aria-hidden
        kind={props.machineByEnvironmentId.get(member.environmentId) ?? "server"}
        className="size-3.5"
      />
      {projectComputerLabel(props.group)}
    </span>
  );
}
