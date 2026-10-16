// In CI, every number the budget tests measure becomes a notice on the job, so they can be
// read on the pull request itself, next to any failure, without downloading the artifact.

import type { Reporter, TestCase } from '@playwright/test/reporter'

export default class Notices implements Reporter {
  onTestEnd(test: TestCase) {
    const project = test.parent.project()?.name ?? ''
    const scenario = test.titlePath().slice(-2).join(' › ')
    for (const { type, description } of test.annotations)
      console.log(`::notice title=perf · ${project}::${scenario} · ${type}: ${description ?? ''}`)
  }
}
