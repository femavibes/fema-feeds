import type { ProjectL1Config } from '@cfb/core-types'
import {
  applyCompiledIngestGate,
  compileProjectPrefilter,
  emptyPrefilter,
} from '@cfb/l1-compile'

/** Enabled projects, optionally with permissive (empty) prefilters for benchmark runs. */
export function projectsForIngestBenchmark(
  projects: ProjectL1Config[],
  ignorePrefilters: boolean,
): ProjectL1Config[] {
  const enabled = projects.filter((p) => p.enabled)
  if (!ignorePrefilters) return enabled

  return enabled.map((project) => {
    const prefilter = emptyPrefilter()
    const compiled = compileProjectPrefilter(project.projectId, prefilter)
    return applyCompiledIngestGate({ ...project, prefilter }, compiled)
  })
}
