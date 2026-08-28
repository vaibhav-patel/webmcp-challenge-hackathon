import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles.css'

// Dev-only handle for driving the agent tool path from the console during
// development. Not used by the app or exposed in production builds.
if (import.meta.env.DEV) {
  Promise.all([import('./model/store'), import('./webmcp/tools')]).then(([{ store }, { buildTools }]) => {
    const tools = Object.fromEntries(buildTools().map((t) => [t.name, t]))
    ;(window as unknown as Record<string, unknown>).__papercut = { store, tools }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
