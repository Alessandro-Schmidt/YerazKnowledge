import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { session } from './store/session'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { applyCustom, saveCustom, savedCustom } from './ui/customTheme'
import { installFlags } from './ui/flags'
import { installTheme, savedTheme } from './ui/theme'

installTheme(savedTheme())
// Only the map zooms (global.css): Safari's own page pinch is refused here too. The map's
// pinch is made of touch events, so it still works.
document.addEventListener('gesturestart', (e) => e.preventDefault())
// A saved theme that no longer parses would still flash its CSS at every load (index.html).
const custom = savedCustom()
if (!custom) saveCustom(null)
applyCustom(custom)
installFlags()

// `npm run dev:fake` answers every GitHub request from the in-memory fake and signs in
// with its token. The check is replaced at build time, so production never includes it.
const ready =
  import.meta.env.MODE === 'fake'
    ? import('../test/fake-github/browser').then(async ({ startFakeGitHub, FAKE_TOKEN }) => {
        await startFakeGitHub()
        await session.getState().start()
        if (session.getState().phase === 'signed-out') await session.getState().signIn(FAKE_TOKEN)
      })
    : Promise.resolve()

void ready.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
