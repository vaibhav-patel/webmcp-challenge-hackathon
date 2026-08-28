import { useEffect, useRef } from 'react'
import { store } from '../model/store'
import { useStore } from './useStore'
import type { Timeline } from '../model/types'

const COL = {
  bg: 'rgba(255,255,255,0.02)',
  kept: '#ffb37a',
  keptCore: '#ff7a3c',
  cut: 'rgba(255,90,90,0.28)',
  gap: 'rgba(255,255,255,0.10)',
  playhead: '#ffffff',
}

export function Waveform() {
  const snap = useStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<Float32Array | null>(null)
  const peaksForRef = useRef<string>('')

  // (Re)compute the amplitude envelope when a new project loads.
  useEffect(() => {
    const buf = store.buffer
    const key = `${snap.name}:${snap.timeline.sourceDuration}`
    if (!buf || peaksForRef.current === key) return
    peaksRef.current = computePeaks(buf, 1600)
    peaksForRef.current = key
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.name, snap.timeline.sourceDuration])

  // Redraw on any edit.
  useEffect(draw, [snap.timeline, snap.edit, snap.currentWordId])

  // Animate the playhead while playing.
  useEffect(() => {
    if (!snap.playing) {
      draw()
      return
    }
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.playing])

  function draw() {
    const canvas = canvasRef.current
    const peaks = peaksRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const W = Math.max(1, Math.floor(rect.width))
    const H = Math.max(1, Math.floor(rect.height))
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const src = snap.timeline.sourceDuration
    if (!peaks || src <= 0) return

    const waveH = H - 14
    const mid = waveH / 2
    const t = snap.transcript
    const cut = snap.edit.cut

    for (let x = 0; x < W; x++) {
      const st = (x / W) * src
      const amp = peaks[Math.floor((x / W) * peaks.length)] || 0
      const h = Math.max(1, amp * (waveH * 0.92))
      const state = t ? coverage(t, cut, st) : 1
      ctx.fillStyle = state === 2 ? COL.cut : state === 0 ? COL.gap : COL.kept
      ctx.fillRect(x, mid - h / 2, 1, h)
      if (state === 1) {
        ctx.fillStyle = COL.keptCore
        ctx.fillRect(x, mid - h / 6, 1, h / 3)
      }
    }

    // Compaction bar: filled width shows how short the edit now is vs source.
    const frac = src > 0 ? snap.timeline.duration / src : 1
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, waveH + 6, W, 6)
    ctx.fillStyle = COL.keptCore
    ctx.fillRect(0, waveH + 6, W * frac, 6)

    // Playhead (mapped from output time back to source time).
    const srcPos = outputToSource(snap.timeline, store.player.playhead)
    if (srcPos != null) {
      const px = (srcPos / src) * W
      ctx.fillStyle = COL.playhead
      ctx.fillRect(px, 0, 1.5, waveH)
    }
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    const srcTime = frac * snap.timeline.sourceDuration
    const out = sourceToOutput(snap.timeline, srcTime)
    store.seek(out)
    if (!snap.playing) store.playFrom(out)
  }

  return (
    <div className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform" onClick={onClick} />
    </div>
  )
}

// --- helpers ---

function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const ch = buffer.getChannelData(0)
  const out = new Float32Array(buckets)
  const per = Math.max(1, Math.floor(ch.length / buckets))
  let max = 0.0001
  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const start = b * per
    const end = Math.min(ch.length, start + per)
    for (let i = start; i < end; i++) {
      const v = Math.abs(ch[i])
      if (v > peak) peak = v
    }
    out[b] = peak
    if (peak > max) max = peak
  }
  for (let b = 0; b < buckets; b++) out[b] /= max
  return out
}

/** 0 = gap/silence, 1 = kept word, 2 = cut word — at a given SOURCE time. */
function coverage(
  t: { words: { start: number; end: number; id: string }[] },
  cut: Set<string>,
  st: number,
): 0 | 1 | 2 {
  // Linear scan is fine at this size; words are sorted by start.
  for (const w of t.words) {
    if (st >= w.start && st < w.end) return cut.has(w.id) ? 2 : 1
    if (w.start > st) break
  }
  return 0
}

function outputToSource(tl: Timeline, out: number): number | null {
  for (const c of tl.clips) {
    if (out >= c.outStart && out <= c.outEnd) return c.srcStart + (out - c.outStart)
  }
  return tl.clips.length ? tl.clips[0].srcStart : null
}

function sourceToOutput(tl: Timeline, srcTime: number): number {
  // Prefer a kept clip that actually contains this source time.
  for (const c of tl.clips) {
    if (srcTime >= c.srcStart && srcTime < c.srcEnd) return c.outStart + (srcTime - c.srcStart)
  }
  // Otherwise jump to the nearest kept clip by source start.
  let best = tl.clips[0]
  let bestD = Infinity
  for (const c of tl.clips) {
    const d = Math.abs(c.srcStart - srcTime)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best ? best.outStart : 0
}
