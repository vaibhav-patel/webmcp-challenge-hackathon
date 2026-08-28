import { useEffect, useState } from 'react'
import { store } from '../model/store'
import { loadSampleProject } from '../model/project'
import { registerTools } from '../webmcp/register'
import { buildTools } from '../webmcp/tools'
import { useStore } from './useStore'
import { Toolbar } from './Toolbar'
import { Waveform } from './Waveform'
import { Transcript } from './Transcript'
import { AgentActivity } from './AgentActivity'

let toolsRegistered = false

export function App() {
  const snap = useStore()
  const [loadError, setLoadError] = useState<string | null>(null)

  // Register WebMCP tools once, as early as possible, so an agent that opens the
  // page finds them immediately.
  useEffect(() => {
    if (toolsRegistered) return
    toolsRegistered = true
    registerTools(buildTools()).then((r) => {
      store.setWebmcpStatus(r.available ? 'available' : 'unavailable')
      if (r.error) console.warn('WebMCP registration issue:', r.error)
      else console.info('WebMCP tools registered:', r.registered.join(', ') || '(none)')
    })
  }, [])

  // Auto-load the sample so the app is immediately usable by a human or an agent.
  useEffect(() => {
    loadSampleProject()
      .then((p) => store.loadProject(p))
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="scissors" aria-hidden>✂</span>
          <div>
            <h1>Papercut</h1>
            <p className="tagline">Edit a podcast by striking through its transcript — together with your agent.</p>
          </div>
        </div>
        <WebmcpBadge status={snap.webmcp} />
      </header>

      <Toolbar />

      {loadError && (
        <div className="banner error">
          Couldn't load the sample: {loadError}. Run <code>npm run gen:sample</code>, or upload your own audio + transcript.
        </div>
      )}

      <main className="workspace">
        <section className="editor">
          <Waveform />
          <Transcript />
        </section>
        <AgentActivity />
      </main>
    </div>
  )
}

function WebmcpBadge({ status }: { status: 'unknown' | 'available' | 'unavailable' }) {
  const label =
    status === 'available'
      ? 'WebMCP connected'
      : status === 'unavailable'
        ? 'WebMCP not detected'
        : 'Checking WebMCP…'
  return (
    <div className={`webmcp-badge ${status}`} title="Whether this browser exposes document.modelContext for agents">
      <span className="dot" />
      {label}
    </div>
  )
}
