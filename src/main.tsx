import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { session } from './store/session'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { applyCustom, savedCustom } from './ui/customTheme'
import { installTheme, savedTheme } from './ui/theme'

installTheme(savedTheme())
applyCustom(savedCustom())

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
