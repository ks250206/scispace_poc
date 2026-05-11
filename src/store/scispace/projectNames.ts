import type { ProjectSummary } from "./stateTypes";

export const uniqueProjectName = (
  requestedName: string,
  projects: Pick<ProjectSummary, "id" | "name">[],
  currentProjectId?: string,
): string => {
  const existingNames = new Set(
    projects.filter((project) => project.id !== currentProjectId).map((project) => project.name),
  );
  if (!existingNames.has(requestedName)) return requestedName;
  let index = 1;
  let candidate = `${requestedName} (${index})`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${requestedName} (${index})`;
  }
  return candidate;
};
