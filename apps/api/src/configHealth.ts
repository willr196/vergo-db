/**
 * Registry of configuration problems that degrade the service without stopping it.
 *
 * Boot-time throws over a single missing secret took the public site down on
 * 2026-09-15. Modules that find bad config now record it here and carry on in a
 * reduced mode, and the readiness endpoint reports it, so the failure is loud
 * without being fatal.
 */
const problems = new Map<string, string>()

/** Record a problem under `name`, or pass null to clear it (the config is fine now). */
export function reportConfigProblem(name: string, message: string | null) {
  if (message === null) {
    problems.delete(name)
  } else {
    problems.set(name, message)
  }
}

/** Current problems, as `{ setting, message }`, sorted for stable output. */
export function configProblems() {
  return Array.from(problems.entries())
    .map(([setting, message]) => ({ setting, message }))
    .sort((a, b) => a.setting.localeCompare(b.setting))
}
