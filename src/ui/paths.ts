// Node ids are repository paths; in the URL each segment is encoded.

export const encodePath = (id: string) => id.split('/').map(encodeURIComponent).join('/')

export function decodePath(path: string): string {
  try {
    return path.split('/').map(decodeURIComponent).join('/')
  } catch {
    return path
  }
}

export const treeHref = (repo: string, id?: string | null) =>
  id === undefined || id === null ? `/tree/${repo}` : `/tree/${repo}/${encodePath(id)}`
