// The one store. Both the human's clicks and the agent's WebMCP tool calls go
// through these methods, so every edit updates the timeline, the transcript, the
// waveform and the duration counter identically no matter who made it.

import { EdlPlayer } from '../audio/player'
import { computeTimeline, fmtDuration } from './timeline'
import type {
  ActivityEntry,
  EditState,
  Timeline,
  Transcript,
} from './types'

export type Actor = 'agent' | 'human'
export type WebmcpStatus = 'unknown' | 'available' | 'unavailable'

export interface Project {
  name: string
  transcript: Transcript
  buffer: AudioBuffer
  /** Optional URL of a compressed source for the audio element / fallback. */
  audioUrl?: string
}

/** Human edits accumulated since the agent last called get_edit_state. */
export interface PendingHumanChanges {
  restored: string[]
  cut: string[]
  locked: string[]
  unlocked: string[]
  reordered: boolean
}

export interface Snapshot {
  loaded: boolean
  name: string
  transcript: Transcript | null
  edit: EditState
  timeline: Timeline
  activity: ActivityEntry[]
  playing: boolean
  currentWordId: string | null
  pulseIds: string[]
  pulseSeq: number
  status: string
  webmcp: WebmcpStatus
}

const emptyTimeline: Timeline = { clips: [], duration: 0, sourceDuration: 0 }

function emptyEdit(): EditState {
  return { locked: new Set(), cut: new Set(), maxGapMs: null, order: [] }
}

class Store {
  private listeners = new Set<() => void>()
  private snap: Snapshot = {
    loaded: false,
    name: '',
    transcript: null,
    edit: emptyEdit(),
    timeline: emptyTimeline,
    activity: [],
    playing: false,
    currentWordId: null,
    pulseIds: [],
    pulseSeq: 0,
    status: 'Load a project to begin.',
    webmcp: 'unknown',
  }

  buffer: AudioBuffer | null = null
  audioUrl: string | undefined
  player = new EdlPlayer(() => this.snap.timeline)
  private activityId = 1
  private pendingHuman: PendingHumanChanges = blankPending()

  constructor() {
    this.player.onFrame = (out) => this.onFrame(out)
    this.player.onEnded = () => this.set({ playing: false })
  }

  // ---- subscription ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): Snapshot => this.snap
  private emit() {
    for (const l of this.listeners) l()
  }
  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.emit()
  }

  setWebmcpStatus(s: WebmcpStatus) {
    this.set({ webmcp: s })
  }

  // ---- project loading ----
  loadProject(p: Project) {
    this.player.stop()
    this.buffer = p.buffer
    this.audioUrl = p.audioUrl
    const edit: EditState = {
      locked: new Set(),
      cut: new Set(),
      maxGapMs: null,
      order: p.transcript.segments.map((s) => s.id),
    }
    this.player.setBuffer(p.buffer)
    const timeline = computeTimeline(p.transcript, edit)
    this.pendingHuman = blankPending()
    this.snap = {
      ...this.snap,
      loaded: true,
      name: p.name,
      transcript: p.transcript,
      edit,
      timeline,
      activity: [],
      playing: false,
      currentWordId: null,
      pulseIds: [],
      status: `Loaded "${p.name}" · ${fmtDuration(timeline.duration)}`,
    }
    this.emit()
  }

  // ---- core mutation ----
  private recompute(edit: EditState): Timeline {
    return computeTimeline(this.snap.transcript!, edit)
  }

  private logActivity(actor: Actor, tool: string, detail: string, delta: number) {
    const entry: ActivityEntry = {
      id: this.activityId++,
      actor,
      tool,
      detail,
      deltaSec: delta,
      t: this.activityId,
    }
    const activity = [...this.snap.activity, entry].slice(-60)
    return activity
  }

  private apply(
    actor: Actor,
    tool: string,
    detail: string,
    mutate: (e: EditState) => void,
    pulse: string[] = [],
  ): { removedSec: number; duration: number } {
    if (!this.snap.transcript) return { removedSec: 0, duration: 0 }
    const before = this.snap.timeline.duration
    const edit: EditState = {
      locked: new Set(this.snap.edit.locked),
      cut: new Set(this.snap.edit.cut),
      maxGapMs: this.snap.edit.maxGapMs,
      order: [...this.snap.edit.order],
    }
    mutate(edit)
    const timeline = this.recompute(edit)
    const delta = timeline.duration - before
    const activity = this.logActivity(actor, tool, detail, delta)
    this.snap = {
      ...this.snap,
      edit,
      timeline,
      activity,
      pulseIds: pulse,
      pulseSeq: this.snap.pulseSeq + 1,
      status: `${detail} · now ${fmtDuration(timeline.duration)}`,
    }
    this.player.refresh()
    this.emit()
    return { removedSec: -delta, duration: timeline.duration }
  }

  // ---- edit operations (shared by UI + tools) ----
  cutWords(ids: string[], actor: Actor, tool: string, detail: string) {
    const real = ids.filter((id) => !this.snap.edit.locked.has(id))
    const r = this.apply(actor, tool, detail, (e) => real.forEach((id) => e.cut.add(id)), real)
    if (actor === 'human') this.pendingHuman.cut.push(...real)
    return { ...r, applied: real, blockedByLock: ids.filter((id) => this.snap.edit.locked.has(id)) }
  }

  restoreWords(ids: string[], actor: Actor, tool: string, detail: string) {
    const r = this.apply(actor, tool, detail, (e) => ids.forEach((id) => e.cut.delete(id)), ids)
    if (actor === 'human') this.pendingHuman.restored.push(...ids)
    return r
  }

  setLock(ids: string[], locked: boolean, actor: Actor) {
    const tool = locked ? 'lock_words' : 'unlock_words'
    const detail = `${actor === 'human' ? 'You' : 'Agent'} ${locked ? 'locked' : 'unlocked'} ${ids.length} word(s)`
    this.apply(actor, tool, detail, (e) => {
      ids.forEach((id) => {
        if (locked) {
          e.locked.add(id)
          e.cut.delete(id) // locking a word un-cuts it: it must survive
        } else {
          e.locked.delete(id)
        }
      })
    }, ids)
    if (actor === 'human') (locked ? this.pendingHuman.locked : this.pendingHuman.unlocked).push(...ids)
  }

  setMaxGap(ms: number | null, actor: Actor) {
    const detail = ms == null ? 'Silence tightening cleared' : `Tightened silences to ${ms}ms`
    return this.apply(actor, 'tighten_silences', detail, (e) => {
      e.maxGapMs = ms
    })
  }

  reorder(newOrder: string[], actor: Actor) {
    this.apply(actor, 'reorder_segments', `${actor === 'human' ? 'You' : 'Agent'} reordered segments`, (e) => {
      e.order = newOrder
    })
    if (actor === 'human') this.pendingHuman.reordered = true
  }

  setChapter(segId: string, title: string | undefined, actor: Actor) {
    if (!this.snap.transcript) return
    const segments = this.snap.transcript.segments.map((s) =>
      s.id === segId ? { ...s, chapter: title } : s,
    )
    const transcript: Transcript = { ...this.snap.transcript, segments }
    const activity = this.logActivity(actor, 'add_chapter_marker', title ? `Chapter "${title}"` : 'Chapter removed', 0)
    this.snap = { ...this.snap, transcript, activity, status: title ? `Chapter marker: ${title}` : 'Chapter removed' }
    this.emit()
  }

  resetEdits(actor: Actor) {
    this.apply(actor, 'reset', 'Reset all edits', (e) => {
      e.cut = new Set()
      e.locked = new Set()
      e.maxGapMs = null
    })
  }

  takePendingHuman(): PendingHumanChanges {
    const p = this.pendingHuman
    this.pendingHuman = blankPending()
    return p
  }

  // ---- playback ----
  async togglePlay() {
    if (this.snap.playing) {
      this.player.pause()
      this.set({ playing: false })
    } else {
      await this.player.play()
      this.set({ playing: true })
    }
  }
  async playFrom(out: number) {
    await this.player.play(out)
    this.set({ playing: true })
  }
  pause() {
    this.player.pause()
    this.set({ playing: false })
  }
  seek(out: number) {
    this.player.seek(out)
  }

  private onFrame(out: number) {
    const wid = this.wordAtOutput(out)
    if (wid !== this.snap.currentWordId) this.set({ currentWordId: wid })
  }

  private wordAtOutput(out: number): string | null {
    const clips = this.snap.timeline.clips
    for (const c of clips) {
      if (c.kind === 'word' && out >= c.outStart && out < c.outEnd) return c.wordId ?? null
    }
    return null
  }
}

function blankPending(): PendingHumanChanges {
  return { restored: [], cut: [], locked: [], unlocked: [], reordered: false }
}

export const store = new Store()
