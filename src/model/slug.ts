/** A file-safe name from a title: `Keycloak (IdP)` → `keycloak-idp`. Fixed once a leaf exists (ARCHITECTURE.md §4). */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  )
}
