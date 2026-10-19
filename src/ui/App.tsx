import { useEffect } from 'react'
import { Redirect, Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { session, useSession } from '../store/session'
import { Appearance } from './Appearance'
import { treeHref, decodePath } from './paths'
import { TokenScreen } from './TokenScreen'
import { AllView } from './AllView'
import { FamilyView } from './FamilyView'
import { Start } from './Start'
import { TreeColours } from './TreeColours'
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
//   #/github                              Connect GitHub, when only folders are in use
export function App() {
  const phase = useSession((s) => s.phase)

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
        <Route path="/github" component={ConnectGitHub} />
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </Router>
  )
}

/** The token screen for someone whose Families are all in folders so far. */
function ConnectGitHub() {
  const [, navigate] = useLocation()
  return <TokenScreen onDone={() => navigate('/')} />
}
