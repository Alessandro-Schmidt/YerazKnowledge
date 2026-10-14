// A small GraphQL executor for the fake GitHub: enough of the language to run the
// operations Yeraz sends (fields, aliases, arguments, variables, inline fragments).
// Responses contain exactly the fields that were asked for, as GitHub's do, and an
// unknown field is an error, so a typo in the app fails in tests, not in production.

type Value = string | number | boolean | null | Value[] | { [key: string]: Value }

interface Field {
  kind: 'field'
  alias: string
  name: string
  args: Record<string, ArgValue>
  selections: Selection[] | null
}
interface InlineFragment {
  kind: 'fragment'
  on: string
  selections: Selection[]
}
type Selection = Field | InlineFragment
type ArgValue =
  | { kind: 'var'; name: string }
  | { kind: 'value'; value: Value }
  | { kind: 'list'; items: ArgValue[] }
  | { kind: 'object'; fields: Record<string, ArgValue> }

export interface Operation {
  type: 'query' | 'mutation'
  selections: Selection[]
}

export class GraphQLError extends Error {
  constructor(
    message: string,
    readonly type?: string,
  ) {
    super(message)
  }
}

// ---------- Parsing ----------

const TOKEN =
  /\s+|,|#[^\n]*|(\.\.\.|[{}():!$[\]=@])|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|([_A-Za-z][_0-9A-Za-z]*)/y

function tokenize(source: string): string[] {
  const tokens: string[] = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < source.length) {
    const at = TOKEN.lastIndex
    const m = TOKEN.exec(source)
    if (!m) throw new GraphQLError(`Parse error on "${source.slice(at, at + 12)}"`)
    const token = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (token !== undefined) tokens.push(token)
  }
  return tokens
}

export function parse(source: string): Operation {
  const t = tokenize(source)
  let i = 0
  const peek = () => t[i]
  const next = () => {
    const token = t[i++]
    if (token === undefined) throw new GraphQLError('Parse error: unexpected end of document')
    return token
  }
  const expect = (token: string) => {
    const got = next()
    if (got !== token) throw new GraphQLError(`Parse error: expected "${token}", got "${got}"`)
  }

  const value = (): ArgValue => {
    const token = next()
    if (token === '$') return { kind: 'var', name: next() }
    if (token === '[') {
      const items: ArgValue[] = []
      while (peek() !== ']') items.push(value())
      next()
      return { kind: 'list', items }
    }
    if (token === '{') {
      const fields: Record<string, ArgValue> = {}
      while (peek() !== '}') {
        const name = next()
        expect(':')
        fields[name] = value()
      }
      next()
      return { kind: 'object', fields }
    }
    if (token.startsWith('"')) return { kind: 'value', value: JSON.parse(token) as string }
    if (/^-?\d/.test(token)) return { kind: 'value', value: Number(token) }
    if (token === 'true' || token === 'false') return { kind: 'value', value: token === 'true' }
    if (token === 'null') return { kind: 'value', value: null }
    return { kind: 'value', value: token } // enum value
  }

  const selectionSet = (): Selection[] => {
    expect('{')
    const selections: Selection[] = []
    while (peek() !== '}') {
      if (peek() === '...') {
        next()
        if (next() !== 'on') throw new GraphQLError('The fake only supports inline fragments')
        const on = next()
        selections.push({ kind: 'fragment', on, selections: selectionSet() })
        continue
      }
      const alias = next()
      let name = alias
      if (peek() === ':') {
        next()
        name = next()
      }
      const args: Record<string, ArgValue> = {}
      if (peek() === '(') {
        next()
        while (peek() !== ')') {
          const arg = next()
          expect(':')
          args[arg] = value()
        }
        next()
      }
      selections.push({
        kind: 'field',
        alias,
        name,
        args,
        selections: peek() === '{' ? selectionSet() : null,
      })
    }
    next()
    return selections
  }

  let type: Operation['type'] = 'query'
  if (peek() === 'query' || peek() === 'mutation') {
    type = next() as Operation['type']
    if (peek() !== '(' && peek() !== '{') next() // operation name
    if (peek() === '(') {
      // Variable definitions: types are not checked by the fake.
      let depth = 0
      do {
        const token = next()
        if (token === '(') depth++
        if (token === ')') depth--
      } while (depth > 0)
    }
  }
  const selections = selectionSet()
  if (i < t.length)
    throw new GraphQLError('The fake supports one operation and no fragment definitions')
  return { type, selections }
}

// ---------- Execution ----------

/**
 * A resolved object: `__typename` plus one entry per field it supports. A field is a
 * plain value, or a function of its arguments (sync or async).
 */
export type GqlObject = { __typename: string } & Record<string, unknown>

export interface GqlError {
  message: string
  path: (string | number)[]
  type?: string
}

function argValue(arg: ArgValue, vars: Record<string, unknown>): unknown {
  switch (arg.kind) {
    case 'var':
      return vars[arg.name] ?? null
    case 'value':
      return arg.value
    case 'list':
      return arg.items.map((item) => argValue(item, vars))
    case 'object':
      return Object.fromEntries(Object.entries(arg.fields).map(([k, v]) => [k, argValue(v, vars)]))
  }
}

export async function execute(
  op: Operation,
  root: GqlObject,
  vars: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; errors: GqlError[] }> {
  const errors: GqlError[] = []

  const selectObject = async (
    obj: GqlObject,
    selections: Selection[],
    path: (string | number)[],
  ): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {}
    for (const sel of selections) {
      if (sel.kind === 'fragment') {
        if (sel.on === obj.__typename)
          Object.assign(out, await selectObject(obj, sel.selections, path))
        continue
      }
      const fieldPath = [...path, sel.alias]
      if (sel.name === '__typename') {
        out[sel.alias] = obj.__typename
        continue
      }
      if (!(sel.name in obj)) {
        errors.push({
          message: `Field '${sel.name}' doesn't exist on type '${obj.__typename}'`,
          path: fieldPath,
          type: 'undefinedField',
        })
        continue
      }
      try {
        const field = obj[sel.name]
        const args = Object.fromEntries(
          Object.entries(sel.args).map(([k, v]) => [k, argValue(v, vars)]),
        )
        const resolved: unknown = typeof field === 'function' ? await field(args) : field
        out[sel.alias] = await complete(resolved, sel, fieldPath)
      } catch (e) {
        if (!(e instanceof GraphQLError)) throw e
        out[sel.alias] = null
        errors.push({ message: e.message, path: fieldPath, ...(e.type ? { type: e.type } : {}) })
      }
    }
    return out
  }

  const complete = async (
    value: unknown,
    sel: Field,
    path: (string | number)[],
  ): Promise<unknown> => {
    if (value === null || value === undefined) return null
    if (Array.isArray(value)) {
      return Promise.all(value.map((item, i) => complete(item, sel, [...path, i])))
    }
    const isObject = typeof value === 'object' && '__typename' in value
    if (isObject && !sel.selections) {
      throw new GraphQLError(
        `Field must have selections (field '${sel.name}' returns ${(value as GqlObject).__typename} but has no selections.)`,
      )
    }
    if (!isObject && sel.selections) {
      throw new GraphQLError(`Selections can't be made on scalars (field '${sel.name}')`)
    }
    return isObject ? selectObject(value as GqlObject, sel.selections!, path) : value
  }

  const data = await selectObject(root, op.selections, [])
  return { data, errors }
}
