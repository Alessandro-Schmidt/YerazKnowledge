import type { Page } from '@playwright/test'
import { expect, isPhone, signInHere, test } from './fixtures'

const REPO = 'you/engineering'
const LEAF = 'Identity/steady.md'
const TEXT = '# Steady\n\nBefore.\n\n- one\n- two\n\nAfter.\n'

async function open(page: Page, fake: import('../test/fake-github/fakeGitHub').FakeGitHub) {
  await fake.repo(REPO).commit({ message: 'a leaf', additions: [{ path: LEAF, contents: TEXT }] })
  await page.goto(`./#/tree/${REPO}/${LEAF}`)
  await signInHere(page)
  await expect(page.locator('.cm-content')).toContainText('Before.')
}

test('debug: the line being written keeps its place', async ({ page, fake }) => {
  test.skip(!isPhone(page), 'phones')
  page.on('console', (m) => console.log('[page]', m.text()))
  await open(page, fake)
  const editor = page.locator('.cm-content')
  await editor.getByText('two').click()
  await page.keyboard.press('End')
  const env = await page.evaluate(() => {
    const scroller = (() => {
      for (let p = document.querySelector('.cm-content')!.parentElement; p; p = p.parentElement) {
        const { overflowY } = getComputedStyle(p)
        if (overflowY === 'auto' || overflowY === 'scroll') return p.className
      }
      return null
    })()
    const vv = window.visualViewport
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      touch: navigator.maxTouchPoints,
      ua: navigator.userAgent,
      inner: [window.innerWidth, window.innerHeight],
      vv: vv ? [vv.offsetTop, vv.height] : null,
      scroller,
      expanded: document.querySelector('[data-expanded]') !== null,
    }
  })
  console.log('ENV', JSON.stringify(env))
  const caretTop = () => page.evaluate(() => getSelection()!.getRangeAt(0).getClientRects()[0]!.top)
  const state = () =>
    page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[class*="_scroll_"]')!
      const box = panel.getBoundingClientRect()
      return {
        scrollTop: panel.scrollTop,
        boxTop: box.top,
        boxBottom: box.bottom,
        scrollHeight: panel.scrollHeight,
      }
    })
  for (let i = 0; i < 25; i++) await page.keyboard.type('\nitem')
  await page.waitForTimeout(500)
  const settled = await caretTop()
  console.log('SETTLED', settled, JSON.stringify(await state()))
  for (let i = 0; i < 5; i++) {
    await page.keyboard.type('\nmore')
    const samples: number[] = []
    for (let t = 0; t < 10; t++) {
      samples.push(Math.round((await caretTop()) * 10) / 10)
      await page.waitForTimeout(100)
    }
    console.log('LINE', i, 'caret samples', samples.join(' '), JSON.stringify(await state()))
  }
  const final = await caretTop()
  console.log('FINAL', final, 'settled', settled, 'diff', final - settled)
  expect(Math.abs(final - settled)).toBeLessThan(2)
})
