// Mermaid diagrams, as github.com draws them: one chunk, loaded the first time a leaf has a
// ```mermaid block. `strict` escapes HTML in labels and turns click handlers off, so a
// diagram from someone else's repository can't run anything. Drawn in the neutral (grey)
// theme; dark modes invert it in CSS, so switching theme redraws nothing and print is light.

import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral',
  suppressErrorRendering: true,
})

let next = 0
const drawn = new Map<string, Promise<string>>()

/** The diagram's SVG, drawn once per source; rejects when the source isn't a diagram. */
export function diagram(source: string): Promise<string> {
  let svg = drawn.get(source)
  if (!svg) {
    svg = mermaid.render(`mermaid-${++next}`, source).then((r) => r.svg)
    drawn.set(source, svg)
  }
  return svg
}
