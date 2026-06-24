import type { ProjectL1Config } from '@cfb/core-types'

export function projectConfigsEqual(a: ProjectL1Config, b: ProjectL1Config): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
