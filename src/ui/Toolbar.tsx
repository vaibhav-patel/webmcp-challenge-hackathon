import { useRef, useState } from 'react'
import { store } from '../model/store'
import { loadSampleProject, loadUploadedProject } from '../model/project'
import { encodeWav, renderTimeline } from '../audio/render'
import { fmtDuration } from '../model/timeline'
import { useStore } from './useStore'

export function Toolbar() {
  const snap = useStore()
  const transcriptInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ transcript?: File; audio?: File }>({})
  const [busy, setBusy] = useState(false)

  const removed = Math.max(0, snap.timeline.sourceDuration - snap.timeline.duration)

  async function exportWav() {
    if (!store.buffer) return
    setBusy(true)
    try {
      const rendered = renderTimeline(store.buffer, snap.timeline)
      const blob = encodeWav(rendered)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugify(snap.name || 'papercut')}-edited.wav`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } finally {
      setBusy(false)
    }
  }

  async function maybeLoadUpload(next: { transcript?: File; audio?: File }) {
    setPending(next)
    if (next.transcript && next.audio) {
      setBusy(true)
      try {
        const p = await loadUploadedProject(next.transcript, next.audio)
        store.loadProject(p)
        setPending({})
      } catch (e) {
        alert(`Couldn't load that project: ${e instanceof Error ? e.message : e}`)
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="counter" title="Edited length vs. original">
          <span className="edited">{fmtDuration(snap.timeline.duration)}</span>
          <span className="of">/ {fmtDuration(snap.timeline.sourceDuration)}</span>
        </div>
        <div className="counter-meta">
          <span className="removed">− {fmtDuration(removed)} removed</span>
          <span className="cut-count">{snap.edit.cut.size} words cut</span>
          {snap.edit.locked.size > 0 && <span className="lock-count">{snap.edit.locked.size} locked</span>}
        </div>
      </div>

      <div className="transport">
        <button className="play" onClick={() => store.togglePlay()} disabled={!snap.loaded}>
          {snap.playing ? '❚❚ Pause' : '► Play'}
        </button>
        <button onClick={() => store.resetEdits('human')} disabled={!snap.loaded} title="Undo every cut and lock">
          Reset
        </button>
      </div>

      <div className="toolbar-right">
        <button
          onClick={() => loadSampleProject().then((p) => store.loadProject(p))}
          disabled={busy}
          title="Load the bundled sample episode"
        >
          Sample
        </button>
        <label className="upload">
          <input
            ref={transcriptInput}
            type="file"
            accept=".json,application/json"
            onChange={(e) => maybeLoadUpload({ ...pending, transcript: e.target.files?.[0] })}
          />
          <span>{pending.transcript ? '✓ transcript' : 'Transcript…'}</span>
        </label>
        <label className="upload">
          <input
            ref={audioInput}
            type="file"
            accept="audio/*"
            onChange={(e) => maybeLoadUpload({ ...pending, audio: e.target.files?.[0] })}
          />
          <span>{pending.audio ? '✓ audio' : 'Audio…'}</span>
        </label>
        <button className="export" onClick={exportWav} disabled={!snap.loaded || busy}>
          {busy ? 'Working…' : '⭳ Export WAV'}
        </button>
      </div>
    </div>
  )
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'papercut'
}
