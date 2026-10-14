// The Trees from the design (design/screens/source/Tree.dc.html and Main.dc.html) as real
// repositories, so the app can be screenshotted next to design/screens/ with the same
// content: Engineering with Keycloak, OAuth 2.0 and the rest, word counts and threads
// as designed, plus the three smaller Trees on Home.

import { parseLeaf } from '../../src/model/parse'
import { slugify } from './fixture'

interface DesignNode {
  name: string
  folder?: string
  words?: number
  emoji?: string
  sum?: string
  children?: DesignNode[]
  id?: string
}

const n = (
  id: string,
  name: string,
  words: number,
  sum: string,
  children?: DesignNode[],
): DesignNode => ({
  id,
  name,
  words,
  sum,
  ...(children ? { children } : {}),
})
const branch = (folder: string, children: DesignNode[]): DesignNode => ({
  name: folder,
  folder,
  children,
})

const ENGINEERING: DesignNode[] = [
  branch('Backend', [
    n(
      'java',
      'Java',
      4200,
      'Language notes from Java 8 to 21: what changed, what to use, what to avoid.',
      [
        n('streams', 'Streams', 900, 'Collectors, grouping, and when a plain loop is clearer.'),
        n(
          'records',
          'Records',
          600,
          'Immutable data carriers, compact constructors and pattern matching.',
        ),
        n(
          'vthreads',
          'Virtual Threads',
          1300,
          'Project Loom in practice: thread-per-request without pool tuning.',
        ),
      ],
    ),
    n(
      'spring',
      'Spring Boot',
      3100,
      'Auto-configuration, profiles, and how a Boot app actually starts.',
      [
        n(
          'springsec',
          'Spring Security',
          1500,
          'The filter chain, resource servers, and mapping JWT claims to authorities.',
        ),
        n(
          'springdata',
          'Spring Data',
          1100,
          'Repositories, derived queries, and the N+1 traps to watch for.',
        ),
      ],
    ),
    n(
      'rest',
      'REST Design',
      1400,
      'Resource naming, status codes, pagination and versioning rules.',
    ),
  ]),
  branch('Identity', [
    {
      ...n('keycloak', 'Keycloak', 2600, ''),
      emoji: '🔐',
      children: [
        n(
          'realms',
          'Realms',
          700,
          'One realm per environment; clients, roles and users live inside it.',
        ),
        n(
          'tokens',
          'Tokens',
          1200,
          'Access, refresh and ID tokens: lifetimes, claims and validation.',
        ),
      ],
    },
    n('oauth', 'OAuth 2.0', 2000, 'Authorization code with PKCE, client credentials, and scopes.'),
    n(
      'oidc',
      'OpenID Connect',
      1300,
      'The identity layer on top of OAuth 2.0: ID tokens and discovery.',
    ),
  ]),
  branch('Cloud', [
    n('gcp', 'Google Cloud', 1800, 'Projects, regions, and the services worth learning first.', [
      n(
        'cloudrun',
        'Cloud Run',
        900,
        'Containers that scale to zero; cold starts and concurrency.',
      ),
      n('iam', 'IAM', 800, 'Service accounts, roles and least privilege across projects.'),
    ]),
    n('docker', 'Docker', 1500, 'Layered images, multi-stage builds and small runtime images.'),
    branch('CI-CD', [
      n('jenkins', 'Jenkins', 700, 'Declarative pipelines, shared libraries and agents.'),
      n('circleci', 'CircleCI', 400, 'Orbs, caching and parallel test splitting.'),
    ]),
  ]),
  branch('Data', [
    n(
      'postgres',
      'PostgreSQL',
      2200,
      'Everyday PostgreSQL: types, constraints and reading query plans.',
      [
        n(
          'indexes',
          'Indexes',
          1000,
          'B-tree vs GIN, composite index order, and when not to index.',
        ),
        n(
          'tx',
          'Transactions',
          1100,
          'Isolation levels, locking, and what @Transactional really does.',
        ),
      ],
    ),
    n('oracle', 'Oracle DB', 600, 'Differences that bite when moving from Oracle to PostgreSQL.'),
    n(
      'schema',
      'Schema Design',
      900,
      'Naming, normalisation, and migrations that never lose data.',
    ),
  ]),
  branch('Frontend', [
    n('react', 'React', 1700, 'Components, rendering, and keeping state where it belongs.', [
      n('hooks', 'Hooks', 800, 'Effect dependencies, custom hooks and memoisation.'),
    ]),
    n('angular', 'Angular', 1000, 'Modules, RxJS and change detection in large apps.'),
  ]),
  branch('AI Agents', [
    n(
      'prompting',
      'Prompting',
      1100,
      'Writing instructions an agent can follow: context, constraints, examples.',
    ),
    n(
      'claudecode',
      'Claude Code',
      1600,
      'Working with an agent on a real codebase: plans, reviews, CLAUDE.md.',
    ),
    n('evals', 'Evaluations', 500, 'Checking agent output with tests instead of impressions.'),
  ]),
]

const ENGINEERING_LINKS: [string, string][] = [
  ['springsec', 'oauth'],
  ['springsec', 'keycloak'],
  ['tokens', 'oidc'],
  ['keycloak', 'oauth'],
  ['oidc', 'oauth'],
  ['iam', 'keycloak'],
  ['cloudrun', 'docker'],
  ['jenkins', 'docker'],
  ['springdata', 'tx'],
  ['hooks', 'rest'],
  ['angular', 'rest'],
  ['claudecode', 'java'],
  ['vthreads', 'cloudrun'],
  ['schema', 'springdata'],
  ['evals', 'circleci'],
  ['prompting', 'claudecode'],
  ['indexes', 'schema'],
]

const FILLER = (
  'The notes below collect what worked, what did not, and the reasons behind each choice. ' +
  'Each section starts from a concrete case and ends with the rule it suggests. ' +
  'Where a decision depends on context, both options are written down with their costs. ' +
  'Examples come from real projects, trimmed to the part that matters. '
).trim()

/** Keycloak's body as drawn in the design's Peek (design/screens/03). */
const keycloakBody = (oidc: string, springsec: string, oauth: string) =>
  [
    `Open-source identity provider. Each realm keeps its own users, clients and roles, and our apps sign in through [OpenID Connect](/${oidc}) to receive signed JWTs.`,
    '## How our services use it',
    `Every Spring service is an OAuth 2.0 resource server: it checks each token against the realm keys. The setup lives in [Spring Security](/${springsec}).`,
    '```\nGET /realms/{realm}/.well-known/openid-configuration\n```',
    '## Open questions',
    '- [x] Map realm roles to Spring authorities\n- [ ] Rotate the realm signing keys every 90 days',
    `Background: [OAuth 2.0](/${oauth}).`,
  ].join('\n\n')

function pad(text: string, words: number): string {
  let out = text
  while (parseLeaf(out).words < words) out += `\n\n${FILLER}`
  // Trim the last paragraph to land on the designed word count.
  while (parseLeaf(out).words > words && /\s\S+$/.test(out)) out = out.replace(/\s\S+$/, '')
  return `${out.replace(/[\s,;:]+$/, '')}.\n`
}

function treeFiles(nodes: DesignNode[], links: [string, string][]): Record<string, string> {
  const pathOf = new Map<string, string>()
  const walk = (list: DesignNode[], dir: string) => {
    for (const node of list) {
      if (node.folder) {
        walk(node.children ?? [], `${dir}${node.folder}/`)
        continue
      }
      const slug = slugify(node.name)
      pathOf.set(node.id!, `${dir}${slug}.md`)
      if (node.children) walk(node.children, `${dir}${slug}/`)
    }
  }
  walk(nodes, '')

  const files: Record<string, string> = {}
  const each = (list: DesignNode[]) => {
    for (const node of list) {
      if (node.children) each(node.children)
      if (node.folder) continue
      const outgoing = links.filter(([from]) => from === node.id).map(([, to]) => to)
      const title = `# ${node.emoji ? `${node.emoji} ` : ''}${node.name}`
      const body =
        node.id === 'keycloak'
          ? keycloakBody(pathOf.get('oidc')!, pathOf.get('springsec')!, pathOf.get('oauth')!)
          : [node.sum, ...outgoing.map((id) => `See [${nameOf(id)}](/${pathOf.get(id)}).`)]
              .filter(Boolean)
              .join(' ')
      files[pathOf.get(node.id!)!] = pad(`${title}\n\n${body}`, node.words!)
    }
  }
  const names = new Map<string, string>()
  const index = (list: DesignNode[]) =>
    list.forEach((x) => (x.id && names.set(x.id, x.name), index(x.children ?? [])))
  index(nodes)
  const nameOf = (id: string) => names.get(id)!
  each(nodes)
  return files
}

/** The design's generator for the smaller Trees on Home (Main.dc.html, genTree). */
function generated(spec: [string, number[]][], seed: number) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296), s / 4294967296)
  const words = () => 200 + Math.round(rnd() * 130) * 10
  let id = 0
  const leaves: string[] = []
  const nodes: DesignNode[] = spec.map(([b, subs]) =>
    branch(
      b,
      subs.map((sub, i) => {
        const leaf = n(`l${id++}`, `${b} ${i + 1}`, words(), '', [])
        leaves.push(leaf.id!)
        for (let j = 0; j < sub; j++) {
          const child = n(`s${id++}`, `${b} ${i + 1}.${j + 1}`, words(), '')
          leaf.children!.push(child)
          leaves.push(child.id!)
        }
        if (!leaf.children!.length) delete leaf.children
        return leaf
      }),
    ),
  )
  const links: [string, string][] = []
  for (let i = 0; links.length < Math.round(leaves.length * 0.5) && i < 400; i++) {
    const a = leaves[Math.floor(rnd() * leaves.length)]!
    const b = leaves[Math.floor(rnd() * leaves.length)]!
    if (a !== b && !links.some(([x, y]) => (x === a && y === b) || (x === b && y === a)))
      links.push([a, b])
  }
  return treeFiles(nodes, links)
}

export interface DesignTree {
  repo: string
  files: Record<string, string>
}

/** In the design's order on Home. */
export function designTrees(owner = 'you'): DesignTree[] {
  const marker = (name: string, color?: string) =>
    `${JSON.stringify({ name, ...(color ? { color } : {}) })}\n`
  return [
    {
      repo: `${owner}/engineering`,
      files: { '.yeraz.json': marker('Engineering'), ...treeFiles(ENGINEERING, ENGINEERING_LINKS) },
    },
    {
      repo: `${owner}/art-history`,
      files: {
        '.yeraz.json': marker('Art History', 'amber'),
        ...generated(
          [
            ['Antiquity', [0, 0, 2]],
            ['Renaissance', [3, 0, 0, 2]],
            ['Baroque', [0, 2, 0]],
            ['Neoclassicism', [2, 0, 0]],
            ['Sacred Art', [0, 0, 3, 0]],
            ['Modernism', [0, 1]],
          ],
          11,
        ),
      },
    },
    {
      repo: `${owner}/languages`,
      files: {
        '.yeraz.json': marker('Languages'),
        ...generated(
          [
            ['Russian', [3, 0, 2, 0]],
            ['French', [0, 2, 0]],
            ['German', [0, 0, 1]],
            ['Linguistics', [2, 0]],
          ],
          23,
        ),
      },
    },
    {
      repo: `${owner}/music-theory`,
      files: {
        '.yeraz.json': marker('Music Theory'),
        ...generated(
          [
            ['Harmony', [2, 0, 0]],
            ['Counterpoint', [0, 2]],
            ['Form', [0, 0, 1]],
            ['Rhythm', [0, 0]],
          ],
          37,
        ),
      },
    },
  ]
}
