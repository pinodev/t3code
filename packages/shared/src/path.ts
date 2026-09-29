export function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:([/\\]|$)/.test(value);
}

export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

export function isExplicitRelativePath(value: string): boolean {
  return (
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\")
  );
}

function isRootPath(value: string): boolean {
  // The drive separator is required: a bare `C:` is not the drive root (it
  // means "current directory on C:"), and treating it as already-canonical
  // would leave it as `C:` while `C:\` and `C:/` normalize to the drive root,
  // so the same location would fail project identity/dedup comparisons.
  return value === "/" || value === "\\" || /^[a-zA-Z]:[/\\]$/.test(value);
}

function trimTrailingPathSeparators(value: string): string {
  if (value.length === 0 || isRootPath(value)) {
    return value;
  }
  const trimmed = value.startsWith("/")
    ? value.replace(/\/+$/g, "")
    : value.replace(/[\\/]+$/g, "");
  if (trimmed.length === 0) {
    return value;
  }
  return /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
}

export function normalizeProjectPathForDispatch(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

export function normalizeProjectPathForComparison(value: string): string {
  const normalized = normalizeProjectPathForDispatch(value);
  if (isWindowsDrivePath(normalized) || isUncPath(normalized)) {
    return normalized.replaceAll("/", "\\").toLowerCase();
  }
  return normalized;
}

/** Keep a project's subdirectory when a thread runs in a Git worktree. */
export function resolveProjectCwdInWorktree(input: {
  readonly workspaceRoot: string;
  readonly repositoryRoot?: string | null | undefined;
  readonly worktreePath?: string | null | undefined;
}): string {
  const worktreePath = input.worktreePath;
  if (!worktreePath) return input.workspaceRoot;
  if (!input.repositoryRoot) return worktreePath;

  const project = normalizeProjectPathForComparison(input.workspaceRoot);
  const repository = normalizeProjectPathForComparison(input.repositoryRoot);
  if (project === repository) return worktreePath;
  const repositorySeparator = repository.includes("\\") ? "\\" : "/";
  const repositoryPrefix = repository.endsWith(repositorySeparator)
    ? repository
    : `${repository}${repositorySeparator}`;
  if (!project.startsWith(repositoryPrefix)) return worktreePath;

  const relative = project.slice(repositoryPrefix.length).replaceAll("\\", "/");
  const separator = isWindowsAbsolutePath(worktreePath) ? "\\" : "/";
  return `${normalizeProjectPathForDispatch(worktreePath)}${separator}${relative.replaceAll("/", separator)}`;
}
