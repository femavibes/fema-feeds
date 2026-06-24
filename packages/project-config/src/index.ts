import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ProjectL1Config } from '@cfb/core-types'

/** Default directory for per-project L1 JSON (UI / API read-write surface). */
export const DEFAULT_PROJECTS_DIR = 'config/projects'

export function projectConfigPath(projectsDir: string, projectId: string): string {
  return resolve(projectsDir, `${projectId}.json`)
}

export async function loadProject(
  projectsDir: string,
  projectId: string,
): Promise<ProjectL1Config> {
  const raw = await readFile(projectConfigPath(projectsDir, projectId), 'utf8')
  return JSON.parse(raw) as ProjectL1Config
}

/** Load every `*.json` project file in a directory. */
export async function loadAllProjects(projectsDir: string): Promise<ProjectL1Config[]> {
  const files = (await readdir(projectsDir)).filter((f) => f.endsWith('.json'))
  const configs: ProjectL1Config[] = []
  for (const file of files) {
    const raw = await readFile(resolve(projectsDir, file), 'utf8')
    configs.push(JSON.parse(raw) as ProjectL1Config)
  }
  return configs
}

/** Write project L1 config — same file the ingest worker and future UI API use. */
export async function saveProject(
  projectsDir: string,
  config: ProjectL1Config,
): Promise<void> {
  await mkdir(projectsDir, { recursive: true })
  const path = projectConfigPath(projectsDir, config.projectId)
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

/** Delete project JSON file. Throws if missing. */
export async function deleteProject(projectsDir: string, projectId: string): Promise<void> {
  await unlink(projectConfigPath(projectsDir, projectId))
}
