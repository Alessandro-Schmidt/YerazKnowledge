import { useEffect } from 'react'
import { Redirect, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { session, useSession } from '../store/session'
import { Appearance } from './Appearance'
import { treeHref, decodePath } from './paths'
import { openOn } from './FamilyMenu'
import { TokenScreen, WelcomeRoute } from './TokenScreen'
import { AllView } from './AllView'
import { FamilyView } from './FamilyView'
import { Start } from './Start'
import { TreeColours } from './TreeColours'
import { Hidden } from './Hidden'
import { Templates } from './Templates'
import { ViewsSettings } from './ViewsSettings'

// Routes live in the URL hash (GitHub Pages can't rewrite paths):
//   #/                                   the last Family shown here (or the first one found)
//   #/tree/:owner/:name[/path/to/leaf.md] a Family (one repository) with all its Trees,
//                                         optionally with a node selected
//   #/edit/:owner/:name/path/to/leaf.md   an old link: the leaf, editable in its Family
//   #/all[/:owner/:name/path]            every Family on one map, optionally with a node selected
//   #/settings/appearance                 Settings › Appearance (system colours, fonts)
//   #/settings/views                      Settings › Views (how a Family is shown)
//   #/settings/colours                    Settings › Tree colours (in .yeraz.json)
//   #/settings/hidden                     Settings › Hidden (leaves and branches hidden from the map)
//   #/settings/templates[/owner/name/path] Settings › Templates (for new leaves), one open to edit
//   #/welcome[/github|/folder|/token]     the introduction, from the Yeraz logo: connect GitHub
//                                         or a repository, a new project folder, an existing one,
//                                         or another token in place of the one in use
/**
 * The address the app was opened at. Opening it on a Family's own address (a tab the browser
 * restored, a bookmark) shows every Family together, as `#/` does (issue #69); an address
 * naming a leaf still opens on it.
 */
let opened: string | null = typeof location === 'undefined' ? null : location.hash
const FAMILY_ONLY = /^#\/tree\/[^/]+\/[^/]+\/?$/

export function App() {
  const phase = useSession((s) => s.phase)

  // Once, as the app starts signed in (a link followed through sign-in keeps its Family).
  useEffect(() => {
    if (phase === 'starting' || opened === null) return
    const at = opened
    opened = null
    if (phase !== 'signed-in' || !FAMILY_ONLY.test(at) || location.hash !== at) return
    if (session.getState().trees.length > 1 && openOn() === 'all') location.replace('#/all')
  }, [phase])

  useEffect(() => {
    void session.getState().start()
  }, [])

  // Commit triggers besides the two-minute wait (ARCHITECTURE.md §5.2): the app going to
  // the background, the connection coming back, and Ctrl/Cmd+S.
  useEffect(() => {
    const flush = () => void session.getState().flushAll()
    const onHidden = () => document.visibilityState === 'hidden' && flush()
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        flush()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('online', flush)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('online', flush)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Browsers can evict IndexedDB under storage pressure, and it holds the pending edits:
  // ask to keep it once someone is signed in (ARCHITECTURE.md §11).
  useEffect(() => {
    if (phase === 'signed-in') void navigator.storage?.persist?.().catch(() => false)
  }, [phase])

  if (phase === 'starting') return null
  if (phase === 'signed-out') return <TokenScreen />
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Start} />
        <Route path="/tree/:owner/:name/*?" component={FamilyView} />
        <Route path="/all/:owner/:name/*?" component={AllView} />
        <Route path="/all" component={AllView} />
        <Route path="/edit/:owner/:name/*">
          {(params) => (
            <Redirect
              to={treeHref(`${params.owner}/${params.name}`, decodePath(params['*'] ?? ''))}
              replace
            />
          )}
        </Route>
        <Route path="/settings/appearance" component={Appearance} />
        <Route path="/settings/views" component={ViewsSettings} />
        <Route path="/settings/colours" component={TreeColours} />
        <Route path="/settings/hidden" component={Hidden} />
        <Route path="/settings/templates">
          <Templates />
        </Route>
        <Route path="/settings/templates/:owner/:name/*">
          {(params) => (
            <Templates
              repo={`${params.owner}/${params.name}`}
              path={decodePath(params['*'] ?? '')}
            />
          )}
        </Route>
        <Route path="/welcome/:step?">{(params) => <WelcomeRoute step={params.step} />}</Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </Router>
  )
}
