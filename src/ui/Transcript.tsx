import { useEffect, useMemo, useRef, useState } from 'react'
import { store } from '../model/store'
import { useStore } from './useStore'
import type { Word } from '../model/types'

export function Transcript() {
  const snap = useStore()
  const [flashing, setFlashing] = useState<Set<string>>(new Set())
  const lastPulse = useRef(0)
  const currentRef = useRef<HTMLSpanElement>(null)

  // Briefly flash words that just changed (agent cut cascade / human restore).
  useEffect(() => {
    if (snap.pulseSeq === lastPulse.current) return
    lastPulse.current = snap.pulseSeq
    if (!snap.pulseIds.length) return
    const ids = new Set(snap.pulseIds)
    setFlashing(ids)
    const timer = setTimeout(() => setFlashing(new Set()), 650)
    return () => clearTimeout(timer)
  }, [snap.pulseSeq, snap.pulseIds])

  // Keep the currently-playing word in view.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [snap.currentWordId])

  const wordsById = useMemo(() => {
    const m = new Map<string, Word>()
    snap.transcript?.words.forEach((w) => m.set(w.id, w))
    return m
  }, [snap.transcript])

  if (!snap.transcript) {
    return <div className="transcript empty">Loading transcript…</div>
  }

  const segMap = new Map(snap.transcript.segments.map((s) => [s.id, s]))

  function onWord(e: React.MouseEvent, w: Word) {
    if (e.metaKey || e.ctrlKey) {
      const locked = snap.edit.locked.has(w.id)
      store.setLock([w.id], !locked, 'human')
      return
    }
    if (snap.edit.cut.has(w.id)) {
      store.restoreWords([w.id], 'human', 'restore_range', `You restored "${w.text}"`)
    } else {
      store.cutWords([w.id], 'human', 'cut_words', `You cut "${w.text}"`)
    }
  }

  return (
    <div className="transcript">
      <p className="hint">
        Click a word to cut or restore it · <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+click to lock it so the agent can’t touch it
      </p>
      {snap.edit.order.map((segId, i) => {
        const seg = segMap.get(segId)
        if (!seg) return null
        return (
          <div className="segment" key={segId}>
            <div className="segment-head">
              <ChapterLabel segId={segId} title={seg.chapter} />
              <div className="seg-controls">
                <button
                  className="reorder"
                  title="Move earlier"
                  disabled={i === 0}
                  onClick={() => move(snap.edit.order, i, -1)}
                >
                  ↑
                </button>
                <button
                  className="reorder"
                  title="Move later"
                  disabled={i === snap.edit.order.length - 1}
                  onClick={() => move(snap.edit.order, i, 1)}
                >
                  ↓
                </button>
              </div>
            </div>
            <p className="words">
              {seg.wordIds.map((id) => {
                const w = wordsById.get(id)
                if (!w) return null
                const cut = snap.edit.cut.has(id)
                const locked = snap.edit.locked.has(id)
                const current = snap.currentWordId === id
                const flash = flashing.has(id)
                const cls = [
                  'w',
                  cut ? 'cut' : '',
                  locked ? 'locked' : '',
                  current ? 'current' : '',
                  flash ? 'flash' : '',
                ].filter(Boolean).join(' ')
                return (
                  <span
                    key={id}
                    ref={current ? currentRef : undefined}
                    className={cls}
                    onClick={(e) => onWord(e, w)}
                    title={locked ? 'Locked — the agent won’t cut this' : cut ? 'Cut — click to restore' : 'Click to cut'}
                  >
                    {w.text}{' '}
                  </span>
                )
              })}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ChapterLabel({ segId, title }: { segId: string; title?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(title ?? '')
  useEffect(() => setVal(title ?? ''), [title])
  if (editing) {
    return (
      <input
        className="chapter-input"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          store.setChapter(segId, val.trim() || undefined, 'human')
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="Chapter title"
      />
    )
  }
  return title ? (
    <button className="chapter" onClick={() => setEditing(true)}>
      <span className="chapter-mark">§</span> {title}
    </button>
  ) : (
    <button className="chapter add" onClick={() => setEditing(true)} title="Add a chapter marker">
      + chapter
    </button>
  )
}

function move(order: string[], i: number, dir: -1 | 1) {
  const next = [...order]
  const j = i + dir
  if (j < 0 || j >= next.length) return
  ;[next[i], next[j]] = [next[j], next[i]]
  store.reorder(next, 'human')
}
