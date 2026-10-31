import { EditorState } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blockChange,
  codeChange,
  createHold,
  HOLD_MS,
  listChange,
  type ListKind,
} from './insertMenu'

const key = (k: string, repeat = false) => ({ key: k, repeat })

describe('createHold: Ctrl/Cmd held alone for 1 s opens the menu', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    const fire = vi.fn()
    return { fire, hold: createHold(fire) }
  }

  it('fires at 1.0 s, not at 0.9 s', () => {
    const { fire, hold } = setup()
    hold.down(key('Control'))
    vi.advanceTimersByTime(HOLD_MS - 100)
    expect(fire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fire).toHaveBeenCalledOnce()
  })

  it('works with Cmd (Meta) too, and ignores the auto-repeat of the held key', () => {
    const { fire, hold } = setup()
    hold.down(key('Meta'))
    vi.advanceTimersByTime(HOLD_MS / 2)
    hold.down(key('Meta', true))
    vi.advanceTimersByTime(HOLD_MS / 2)
    expect(fire).toHaveBeenCalledOnce()
  })

  it('never fires for a shortcut: any other key cancels', () => {
    const { fire, hold } = setup()
    hold.down(key('Control'))
    hold.down(key('c'))
    vi.advanceTimersByTime(5000)
    expect(fire).not.toHaveBeenCalled()
  })

  it('releasing the modifier cancels', () => {
    const { fire, hold } = setup()
    hold.down(key('Control'))
    vi.advanceTimersByTime(HOLD_MS * 0.75)
    hold.up()
    vi.advanceTimersByTime(5000)
    expect(fire).not.toHaveBeenCalled()
  })
})

describe('listChange', () => {
  const apply = (doc: string, at: number, kind: ListKind) => {
    const state = EditorState.create({ doc, selection: { anchor: at } })
    return state.update(listChange(state, kind)).state.doc.toString()
  }

  it('turns the line into a to-do, numbered or bullet item', () => {
    expect(apply('# T\n\nBuy milk', 9, 'todo')).toBe('# T\n\n- [ ] Buy milk')
    expect(apply('# T\n\nFirst', 6, 'ordered')).toBe('# T\n\n1. First')
    expect(apply('# T\n\n', 5, 'bullet')).toBe('# T\n\n- ')
  })

  it('replaces an existing list marker and keeps indentation', () => {
    expect(apply('# T\n\n  - item', 8, 'todo')).toBe('# T\n\n  - [ ] item')
    expect(apply('# T\n\n- [x] done', 8, 'ordered')).toBe('# T\n\n1. done')
    expect(apply('# T\n\n3. third', 7, 'bullet')).toBe('# T\n\n- third')
  })

  it('never touches the title line: it starts a new line below it', () => {
    expect(apply('# T', 3, 'bullet')).toBe('# T\n- ')
  })

  it('leaves the cursor after the marker on an empty line', () => {
    const state = EditorState.create({ doc: '# T\n\n', selection: { anchor: 5 } })
    expect(state.update(listChange(state, 'todo')).state.selection.main.head).toBe(11)
  })
})

describe('codeChange', () => {
  /** The document after, `|` at the cursor. */
  const apply = (doc: string, at: number) => {
    const state = EditorState.create({ doc, selection: { anchor: at } })
    const next = state.update(codeChange(state)).state
    const head = next.selection.main.head
    return next.doc.sliceString(0, head) + '|' + next.doc.sliceString(head)
  }

  it('turns an empty line into a code block, the cursor inside', () => {
    expect(apply('# T\n\n', 5)).toBe('# T\n\n```\n|\n```')
  })

  it('starts the block below a line with text, or below the title and its metadata', () => {
    expect(apply('# T\n\nSome text', 8)).toBe('# T\n\nSome text\n```\n|\n```')
    expect(apply('# T', 3)).toBe('# T\n```\n|\n```')
    expect(apply('# T\n<!-- yeraz {} -->', 1)).toBe('# T\n<!-- yeraz {} -->\n```\n|\n```')
  })
})

describe("blockChange: a block of the person's own Markdown", () => {
  const apply = (doc: string, at: number) => {
    const state = EditorState.create({ doc, selection: { anchor: at } })
    const next = state.update(blockChange(state, '## Notes\n\n- ')).state
    return [next.doc.toString(), next.selection.main.head] as const
  }

  it('fills an empty line, the cursor after it', () => {
    expect(apply('# T\n\nA\n\nB', 7)).toEqual(['# T\n\nA\n## Notes\n\n- \nB', 19])
  })

  it('goes below a line with text, and below the title and its metadata', () => {
    expect(apply('# T\n\nText', 7)[0]).toBe('# T\n\nText\n## Notes\n\n- ')
    expect(apply('# T\n<!-- yeraz {} -->\n\nA', 1)[0]).toBe(
      '# T\n<!-- yeraz {} -->\n## Notes\n\n- \n\nA',
    )
  })
})
