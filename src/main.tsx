import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installTheme } from './ui/theme'
import { Shell } from './ui/Shell'

installTheme()

// `npm run dev:fake` answers every GitHub request from the in-memory fake.
// The check is replaced at build time, so production bundles never include it.
const ready =
  import.meta.env.MODE === 'fake'
    ? import('../test/fake-github/browser').then((m) => m.startFakeGitHub())
    : Promise.resolve()

void ready.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Shell />
    </StrictMode>,
  )
})
