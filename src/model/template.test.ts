import { describe, expect, it } from 'vitest'
import { fillTemplate, isoDate, splitTemplate } from './template'

const MEETING = `# 📝 Meeting
<!-- yeraz {"color":{"heading":"amber"}} -->

{{title}}, on {{date}}, in {{tree}}.

## Decisions

- [ ] …
`
const fill = { title: 'Sprint review', date: new Date(2026, 9, 27, 23, 30), tree: 'Work' }

describe('fillTemplate', () => {
  it('titles the leaf as typed, with the template’s icon and look, and fills the variables', () => {
    expect(fillTemplate(MEETING, fill)).toBe(`# 📝 Sprint review
<!-- yeraz {"color":{"heading":"amber"}} -->

Sprint review, on 2026-10-27, in Work.

## Decisions

- [ ] …
`)
  })

  it('a title with its own emoji keeps it; spaces inside braces are fine; an empty title is Untitled', () => {
    expect(fillTemplate('# 📝 Meeting\n\nHello {{ title }}', { ...fill, title: '🎯 Goals' })).toBe(
      '# 🎯 Goals\n\nHello 🎯 Goals\n',
    )
    expect(fillTemplate('# Plain\n', { ...fill, title: '  ' })).toBe('# Untitled\n\n')
  })

  it('a template without a name line is all body; one hidden from the map makes visible leaves', () => {
    expect(fillTemplate('Just a body for {{tree}}.\n', fill)).toBe(
      '# Sprint review\n\nJust a body for Work.\n',
    )
    expect(
      fillTemplate('# T\n<!-- yeraz {"hidden":true,"cover":"/assets/c.png"} -->\n\nx\n', fill),
    ).toBe('# Sprint review\n<!-- yeraz {"cover":"/assets/c.png"} -->\n\nx\n')
  })

  it('splits a template into its icon, look and body', () => {
    expect(splitTemplate(MEETING)).toEqual({
      icon: '📝',
      meta: { color: { heading: 'amber' } },
      body: '\n{{title}}, on {{date}}, in {{tree}}.\n\n## Decisions\n\n- [ ] …\n',
    })
  })

  it('writes the date as the calendar has it', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
