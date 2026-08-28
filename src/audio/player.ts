// EDL playback engine. Plays the edited timeline seamlessly by scheduling one
// AudioBufferSourceNode per kept clip, back to back, with tiny fades wherever a
// cut splices two non-contiguous pieces of source audio together. Reports the
// output-time playhead every animation frame so the transcript can karaoke.

import type { Timeline } from '../model/types'
import { getAudioContext, resumeAudio } from './context'

const FADE_SEC = 0.004
const LOOKAHEAD = 0.06

export class EdlPlayer {
  private buffer: AudioBuffer | null = null
  private getTimeline: () => Timeline
  private sources: AudioBufferSourceNode[] = []
  private ctxStart = 0
  private outStart = 0
  private raf = 0
  private tick = 0
  playing = false

  onFrame: ((outPos: number) => void) | null = null
  onEnded: (() => void) | null = null

  constructor(getTimeline: () => Timeline) {
    this.getTimeline = getTimeline
  }

  setBuffer(b: AudioBuffer | null) {
    this.stop()
    this.buffer = b
    this.outStart = 0
  }

  get playhead(): number {
    if (!this.playing) return this.outStart
    const ctx = getAudioContext()
    return this.outStart + (ctx.currentTime - this.ctxStart)
  }

  async play(fromOut?: number) {
    if (!this.buffer) return
    await resumeAudio()
    this.stopSources()
    const ctx = getAudioContext()
    const tl = this.getTimeline()
    const from = fromOut != null ? fromOut : this.outStart
    const start = Math.min(from, Math.max(0, tl.duration - 0.001))

    this.outStart = start
    this.ctxStart = ctx.currentTime + LOOKAHEAD
    const fade = FADE_SEC
    const clips = tl.clips

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      if (clip.outEnd <= start) continue
      const clipOutStart = Math.max(clip.outStart, start)
      const offsetIntoClip = clipOutStart - clip.outStart
      const srcOffset = clip.srcStart + offsetIntoClip
      const dur = clip.outEnd - clipOutStart
      if (dur <= 0) continue

      const prev = clips[i - 1]
      const next = clips[i + 1]
      const discontIn = !prev || Math.abs(clip.srcStart - prev.srcEnd) > 1e-4
      const discontOut = !next || Math.abs(next.srcStart - clip.srcEnd) > 1e-4

      const src = ctx.createBufferSource()
      src.buffer = this.buffer
      const gain = ctx.createGain()
      src.connect(gain).connect(ctx.destination)

      const when = this.ctxStart + (clipOutStart - start)
      if (discontIn && offsetIntoClip < fade) {
        gain.gain.setValueAtTime(0, when)
        gain.gain.linearRampToValueAtTime(1, when + fade)
      } else {
        gain.gain.setValueAtTime(1, when)
      }
      if (discontOut) {
        gain.gain.setValueAtTime(1, when + Math.max(0, dur - fade))
        gain.gain.linearRampToValueAtTime(0, when + dur)
      }

      src.start(when, srcOffset, dur)
      this.sources.push(src)
    }

    this.playing = true
    this.loop()
    // rAF is throttled when the tab is backgrounded; a timer keeps the playhead
    // and karaoke highlight advancing regardless.
    this.tick = window.setInterval(() => this.frame(), 60)
  }

  private frame(): boolean {
    if (!this.playing) return false
    const tl = this.getTimeline()
    const pos = this.playhead
    if (this.onFrame) this.onFrame(Math.min(pos, tl.duration))
    if (pos >= tl.duration - 0.005) {
      this.stop()
      this.outStart = 0
      if (this.onEnded) this.onEnded()
      return true
    }
    return false
  }

  private loop = () => {
    if (this.frame()) return
    this.raf = requestAnimationFrame(this.loop)
  }

  pause() {
    if (!this.playing) return
    const pos = this.playhead
    this.stopSources()
    this.playing = false
    this.outStart = Math.max(0, pos)
    if (this.onFrame) this.onFrame(this.outStart)
  }

  seek(outPos: number) {
    const wasPlaying = this.playing
    this.stopSources()
    this.playing = false
    this.outStart = Math.max(0, outPos)
    if (this.onFrame) this.onFrame(this.outStart)
    if (wasPlaying) void this.play(this.outStart)
  }

  /** Re-sync scheduling after the timeline changed mid-playback. */
  refresh() {
    if (this.playing) void this.play(this.playhead)
  }

  stop() {
    this.stopSources()
    this.playing = false
    cancelAnimationFrame(this.raf)
  }

  private stopSources() {
    cancelAnimationFrame(this.raf)
    if (this.tick) {
      clearInterval(this.tick)
      this.tick = 0
    }
    for (const s of this.sources) {
      try {
        s.onended = null
        s.stop()
        s.disconnect()
      } catch {
        /* already stopped */
      }
    }
    this.sources = []
  }
}
