import { useEffect } from 'react'
import { Redirect, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { Home } from '../map/Home'
import { session, useSession } from '../store/session'
import { TokenScreen } from './TokenScreen'
import { TreeView } from './TreeView'

// Routes live in the URL hash (GitHub Pages can't rewrite paths):
//   #/                                   Home, every Tree
//   #/tree/:owner/:name[/path/to/leaf.md] a Tree, optionally with a node selected
export function App() {
  const phase = useSession((s) => s.phase)

  useEffect(() => {
    void session.getState().start()
  }, [])

  if (phase === 'starting') return null
  if (phase === 'signed-out') return <TokenScreen />
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/tree/:owner/:name/*?" component={TreeView} />
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </Router>
  )
}
