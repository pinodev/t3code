const NIGHTLY_SERVER_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

export function formatAppDisplayName(input: {
  readonly baseName: string;
  readonly stageLabel: string;
}): string {
  if (input.stageLabel.trim().toLowerCase() === "latest") {
    return input.baseName;
  }

  return `${input.baseName} (${input.stageLabel})`;
}

export function resolveServerBackedAppStageLabel(input: {
  readonly primaryServerVersion: string | null | undefined;
  readonly fallbackStageLabel: string;
}): string {
  return input.primaryServerVersion &&
    NIGHTLY_SERVER_VERSION_PATTERN.test(input.primaryServerVersion)
    ? "Nightly"
    : input.fallbackStageLabel;
}

export function resolveServerBackedAppDisplayName(input: {
  readonly baseName: string;
  readonly fallbackDisplayName: string;
  readonly fallbackStageLabel: string;
  readonly primaryServerVersion: string | null | undefined;
}): string {
  const stageLabel = resolveServerBackedAppStageLabel({
    primaryServerVersion: input.primaryServerVersion,
    fallbackStageLabel: input.fallbackStageLabel,
  });

  return stageLabel === input.fallbackStageLabel
    ? input.fallbackDisplayName
    : formatAppDisplayName({ baseName: input.baseName, stageLabel });
}

export function formatThreadDocumentTitle(input: {
  readonly appTitle: string;
  readonly threadTitle: string | null;
  readonly environmentLabel: string | null;
}): string {
  const threadTitle = input.threadTitle?.trim();
  if (!threadTitle) return input.appTitle;
  const environmentLabel = input.environmentLabel?.trim();
  const titleAlreadyNamesComputer = environmentLabel
    ? threadTitle.toUpperCase().startsWith(`(${environmentLabel.toUpperCase()}) `)
    : false;
  return `${environmentLabel && !titleAlreadyNamesComputer ? `${environmentLabel} · ` : ""}${threadTitle} | ${input.appTitle}`;
}
