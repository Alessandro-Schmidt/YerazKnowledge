// In CI, every number the budget tests measure goes on the pull request: a table in the
// job's summary, and one notice on the job (GitHub keeps only ten notices per step).

import { appendFileSync } from 'node:fs'
import type { Reporter, TestCase } from '@playwright/test/reporter'

export default class Notices implements Reporter {
  private rows: string[][] = []

  onTestEnd(test: TestCase) {
    const project = test.parent.project()?.name ?? ''
    const scenario = test.titlePath().slice(-2).join(' › ')
    for (const { type, description } of test.annotations)
      this.rows.push([project, scenario, type, description ?? ''])
  }

  onEnd() {
    if (!this.rows.length) return
    const summary = process.env.GITHUB_STEP_SUMMARY
    if (summary) {
      const table = this.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
      appendFileSync(
        summary,
        `### Performance budgets\n\n| Device | Scenario | Number | Measured |\n|---|---|---|---|\n${table}\n`,
      )
    }
    const lines = this.rows.map(([p, s, t, d]) => `${p} · ${s} · ${t}: ${d}`)
    console.log(`::notice title=Performance numbers::${lines.join('%0A')}`)
  }
}
