import type { EnvironmentPresentation } from "../../state/environments";
import type { SettingsScopeSearch } from "./settingsScope";

type ScopeEnvironment = Pick<EnvironmentPresentation, "environmentId" | "label" | "displayUrl">;

export function settingsScopeEnvironmentLabel(
  environment: ScopeEnvironment,
  environments: readonly ScopeEnvironment[],
) {
  const duplicate = environments.some(
    (other) =>
      other.environmentId !== environment.environmentId && other.label === environment.label,
  );
  return duplicate
    ? `${environment.label} · ${environment.displayUrl ?? environment.environmentId}`
    : environment.label;
}

export const ALL_ENVIRONMENTS_VALUE = "all";
export const ALL_PROJECTS_VALUE = "all";

/**
 * The environment axis: `all` or an environment id. A legacy checkout link
 * without `machine` still names one environment, which the resolver supplies.
 */
export function environmentAxisValue(
  search: SettingsScopeSearch,
  resolvedEnvironmentId?: string | null,
): string {
  return search.machine ?? resolvedEnvironmentId ?? ALL_ENVIRONMENTS_VALUE;
}

/** The project axis: `all` or a project key. */
export function projectAxisValue(search: SettingsScopeSearch): string {
  return search.project ?? ALL_PROJECTS_VALUE;
}

/** A project belongs to one computer, so changing computers clears the project. */
export function selectEnvironmentAxis(
  _search: SettingsScopeSearch,
  value: string,
): SettingsScopeSearch {
  const next: SettingsScopeSearch = {};
  if (value !== ALL_ENVIRONMENTS_VALUE) next.machine = value;
  return next;
}

/** Choosing a project selects its computer as well. */
export function selectProjectAxis(
  search: SettingsScopeSearch,
  value: string,
  projectEnvironmentId?: string,
): SettingsScopeSearch {
  const next: SettingsScopeSearch = {};
  if (value !== ALL_PROJECTS_VALUE) next.project = value;
  if (projectEnvironmentId ?? search.machine) next.machine = projectEnvironmentId ?? search.machine;
  return next;
}

export function projectsForEnvironment<T extends { readonly environmentId: string }>(
  groups: readonly T[],
  environmentId: string | undefined,
): T[] {
  return environmentId
    ? groups.filter((group) => group.environmentId === environmentId)
    : [...groups];
}
