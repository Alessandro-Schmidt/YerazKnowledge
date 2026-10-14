import { GITHUB_API } from './client'

declare global {
  interface Window {
    /** End-to-end test builds only: the local fake GitHub's address. */
    __YERAZ_API__?: string
  }
}

/**
 * The GitHub API base URL. Production builds always use GitHub: the override exists only
 * when built with VITE_E2E=1, and the check below is removed from every other build.
 */
export function githubApi(): string {
  return (import.meta.env.VITE_E2E === '1' && window.__YERAZ_API__) || GITHUB_API
}
