import { resolveEnvironmentMachineKind } from "@t3tools/contracts";
import { LayersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { projectComputerLabel, type SidebarProjectSnapshot } from "../../sidebarProjectCatalog";
import type { EnvironmentPresentation } from "../../state/environments";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ProjectFavicon } from "../ProjectFavicon";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { SETTINGS_SECTION_LABELS } from "./settingsSearch";
import { resolveSettingsScope, type SettingsScopeSearch } from "./settingsScope";
import {
  ALL_ENVIRONMENTS_VALUE,
  ALL_PROJECTS_VALUE,
  environmentAxisValue,
  projectAxisValue,
  projectsForEnvironment,
  selectEnvironmentAxis,
  selectProjectAxis,
  settingsScopeEnvironmentLabel,
} from "./settingsScopeAxis";

const SETTINGS_BREADCRUMB_LABELS: Readonly<Record<string, string>> = {
  ...SETTINGS_SECTION_LABELS,
  "/settings/diagnostics": "Diagnostics",
  "/settings/open-source-licenses": "Open source licenses",
};

function settingsBreadcrumbLabel(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_LABELS[normalizedPathname] ?? null;
}

export interface SettingsScopeBreadcrumbProps {
  readonly value: SettingsScopeSearch;
  readonly groups: readonly SidebarProjectSnapshot[];
  readonly environments: readonly EnvironmentPresentation[];
  readonly onChange: (next: SettingsScopeSearch) => void;
}

/**
 * `Settings / Section / Environment / Project`. The last two crumbs are the
 * targets a change applies to and read like the usage page's filter: muted at
 * "all", foreground once narrowed. Each project belongs to one environment.
 */
export function SettingsBreadcrumb({
  pathname,
  scope,
}: {
  pathname: string;
  scope?: SettingsScopeBreadcrumbProps | undefined;
}) {
  const sectionLabel = settingsBreadcrumbLabel(pathname);

  return (
    <WorkspaceBreadcrumb ariaLabel="Settings breadcrumb">
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>Settings</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? "Settings"}
      </WorkspaceBreadcrumbItem>
      {scope ? (
        <>
          <WorkspaceBreadcrumbSeparator />
          <WorkspaceBreadcrumbItem className="min-w-0 shrink">
            <EnvironmentScopeMenu {...scope} />
          </WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
          <WorkspaceBreadcrumbItem className="min-w-0 shrink">
            <ProjectScopeMenu {...scope} />
          </WorkspaceBreadcrumbItem>
        </>
      ) : null}
    </WorkspaceBreadcrumb>
  );
}

function ScopeMenu({
  ariaLabel,
  icon,
  label,
  narrowed,
  children,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  narrowed: boolean;
  children: ReactNode;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex min-w-0 max-w-56 cursor-pointer items-center gap-1.5 rounded-sm text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          narrowed ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
      </MenuTrigger>
      <MenuPopup align="start" className="w-64 max-w-[calc(100vw-2rem)]">
        {children}
      </MenuPopup>
    </Menu>
  );
}

function EnvironmentScopeMenu({
  value,
  groups,
  environments,
  onChange,
}: SettingsScopeBreadcrumbProps) {
  const resolved = resolveSettingsScope(value, groups, environments);
  const environmentValue = environmentAxisValue(
    value,
    resolved.kind === "checkout"
      ? resolved.environmentId
      : resolved.kind === "project"
        ? resolved.group.environmentId
        : null,
  );
  const selected = environments.find(
    (environment) => environment.environmentId === environmentValue,
  );
  return (
    <ScopeMenu
      ariaLabel="Environment scope"
      narrowed={environmentValue !== ALL_ENVIRONMENTS_VALUE}
      icon={
        selected ? (
          <EnvironmentMachineIcon
            aria-hidden
            kind={resolveEnvironmentMachineKind(selected.serverConfig)}
            className="size-3.5 shrink-0"
          />
        ) : null
      }
      label={
        selected
          ? settingsScopeEnvironmentLabel(selected, environments)
          : environmentValue !== ALL_ENVIRONMENTS_VALUE
            ? "Unavailable environment"
            : "All environments"
      }
    >
      <MenuRadioGroup
        value={environmentValue}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(selectEnvironmentAxis(value, next));
        }}
      >
        <MenuRadioItem value={ALL_ENVIRONMENTS_VALUE}>
          <span className="flex min-w-0 items-center gap-2">
            <LayersIcon aria-hidden className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">All environments</span>
            <MenuRadioItemIndicator />
          </span>
        </MenuRadioItem>
        <MenuSeparator />
        {environments.map((environment) => (
          <MenuRadioItem key={environment.environmentId} value={environment.environmentId}>
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentMachineIcon
                aria-hidden
                kind={resolveEnvironmentMachineKind(environment.serverConfig)}
                className="size-3.5"
              />
              <span className="min-w-0 flex-1 truncate">
                {settingsScopeEnvironmentLabel(environment, environments)}
              </span>
              {environment.connection.phase === "connected" ? null : (
                <span className="shrink-0 text-xs text-muted-foreground">Offline</span>
              )}
              <MenuRadioItemIndicator />
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ScopeMenu>
  );
}

function ProjectScopeMenu({ value, groups, onChange }: SettingsScopeBreadcrumbProps) {
  const selected = groups.find(
    (group) =>
      group.projectKey === value.project &&
      (value.machine === undefined || group.environmentId === value.machine),
  );
  const environmentId = value.machine ?? selected?.environmentId;
  const visibleGroups = projectsForEnvironment(groups, environmentId);
  return (
    <ScopeMenu
      ariaLabel="Project scope"
      narrowed={value.project !== undefined}
      icon={selected ? <ProjectFavicon project={selected} className="size-3.5 shrink-0" /> : null}
      label={selected?.displayName ?? (value.project ? "Unavailable project" : "All projects")}
    >
      <MenuRadioGroup
        value={projectAxisValue(value)}
        onValueChange={(next) => {
          if (typeof next === "string") {
            const project = groups.find((group) => group.projectKey === next);
            onChange(selectProjectAxis(value, next, project?.environmentId));
          }
        }}
      >
        <MenuRadioItem value={ALL_PROJECTS_VALUE}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">All projects</span>
            <MenuRadioItemIndicator />
          </span>
        </MenuRadioItem>
        <MenuSeparator />
        {visibleGroups.map((group) => (
          <MenuRadioItem key={group.projectKey} value={group.projectKey}>
            <span className="flex min-w-0 items-center gap-2">
              <ProjectFavicon project={group} className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {projectComputerLabel(group)}
              </span>
              <MenuRadioItemIndicator />
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ScopeMenu>
  );
}
