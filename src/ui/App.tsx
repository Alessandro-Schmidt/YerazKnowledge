import { useEffect } from 'react'
import { Redirect, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { EditorPage } from '../editor/EditorPage'
import { Home } from '../map/Home'
import { session, useSession } from '../store/session'
import { Appearance } from './Appearance'
import { TokenScreen } from './TokenScreen'
import { TreeView } from './TreeView'

// Routes live in the URL hash (GitHub Pages can't rewrite paths):
//   #/                                   Home, every Tree
//   #/tree/:owner/:name[/path/to/leaf.md] a Tree, optionally with a node selected
//   #/edit/:owner/:name/path/to/leaf.md   the editor
//   #/settings/appearance                 Settings › Appearance
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

  if (phase === 'starting') return null
  if (phase === 'signed-out') return <TokenScreen />
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/tree/:owner/:name/*?" component={TreeView} />
        <Route path="/edit/:owner/:name/*" component={EditorPage} />
        <Route path="/settings/appearance" component={Appearance} />
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </Router>
  )
}
