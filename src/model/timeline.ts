// The EDL engine: pure functions that turn (transcript + edit state) into a
// concrete timeline of source->output clips. This is the single source of truth
// that the player, waveform, duration counter and WAV export all consume.

import type { Clip, EditState, Timeline, Transcript, Word } from './types'

/** Silence inserted where words were cut out between two surviving words. */
const JOIN_GAP_SEC = 0.12

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9']+/g, '')
}

/** Words in current program (playback) order, honoring segment reordering. */
export function programWords(t: Transcript, edit: EditState): Word[] {
  const byId = new Map(t.words.map((w) => [w.id, w]))
  const segById = new Map(t.segments.map((s) => [s.id, s]))
  const out: Word[] = []
  for (const segId of edit.order) {
    const seg = segById.get(segId)
    if (!seg) continue
    for (const wid of seg.wordIds) {
      const w = byId.get(wid)
      if (w) out.push(w)
    }
  }
  return out
}

/** Map every word id to its index in the ORIGINAL spoken order. */
function originalIndex(t: Transcript): Map<string, number> {
  const m = new Map<string, number>()
  t.words.forEach((w, i) => m.set(w.id, i))
  return m
}

export function computeTimeline(t: Transcript, edit: EditState): Timeline {
  const prog = programWords(t, edit)
  const origIdx = originalIndex(t)
  const sourceDuration = t.words.length ? Math.max(...t.words.map((w) => w.end)) : 0

  const kept = prog.filter((w) => !edit.cut.has(w.id))
  const clips: Clip[] = []
  let outCursor = 0

  const maxGapSec = edit.maxGapMs == null ? null : edit.maxGapMs / 1000

  for (let i = 0; i < kept.length; i++) {
    const w = kept[i]
    const wStart = w.start
    const wEnd = Math.max(w.end, w.start)
    const wLen = wEnd - wStart

    clips.push({
      srcStart: wStart,
      srcEnd: wEnd,
      outStart: outCursor,
      outEnd: outCursor + wLen,
      wordId: w.id,
      kind: 'word',
    })
    outCursor += wLen

    const next = kept[i + 1]
    if (!next) break

    // Base silence between this surviving word and the next surviving word.
    let baseGap: number
    const ai = origIdx.get(w.id)!
    const bi = origIdx.get(next.id)!
    if (bi === ai + 1) {
      // Truly adjacent in the source: preserve the real breath/pause.
      baseGap = Math.max(0, next.start - wEnd)
    } else if (bi > ai) {
      // Words were cut between them: splice with a short natural-sounding join.
      const gapAfterA = nextGap(t, origIdx, w)
      const gapBeforeB = prevGap(t, origIdx, next)
      baseGap = Math.min(clampPos(gapAfterA), clampPos(gapBeforeB), JOIN_GAP_SEC)
    } else {
      // Reordered so B now precedes A in the source: fixed clean join.
      baseGap = JOIN_GAP_SEC
    }

    if (maxGapSec != null) baseGap = Math.min(baseGap, maxGapSec)
    baseGap = Math.max(0, baseGap)

    if (baseGap > 0.001) {
      const gsStart = wEnd
      const gsEnd = Math.min(sourceDuration, wEnd + baseGap)
      clips.push({
        srcStart: gsStart,
        srcEnd: gsEnd,
        outStart: outCursor,
        outEnd: outCursor + baseGap,
        kind: 'gap',
      })
      outCursor += baseGap
    }
  }

  return { clips, duration: outCursor, sourceDuration }
}

function clampPos(n: number): number {
  return n > 0 ? n : 0
}

function nextGap(t: Transcript, origIdx: Map<string, number>, w: Word): number {
  const i = origIdx.get(w.id)!
  const nxt = t.words[i + 1]
  return nxt ? nxt.start - w.end : 0
}

function prevGap(t: Transcript, origIdx: Map<string, number>, w: Word): number {
  const i = origIdx.get(w.id)!
  const prv = t.words[i - 1]
  return prv ? w.start - prv.end : 0
}

// ---------------------------------------------------------------------------
// Word resolution: the "quote + occurrence" contract the agent's tools use to
// point at exact words without guessing at internal ids.
// ---------------------------------------------------------------------------

export interface ResolveResult {
  wordIds: string[]
  /** All occurrences found, for error messages when occurrence is out of range. */
  occurrences: number
}

/**
 * Find the run of words matching `quote` (normalized token match). If the quote
 * appears multiple times, `occurrence` (1-based) selects which. When occurrence
 * is omitted and the quote is unique, that single match is returned.
 */
export function resolveQuote(
  t: Transcript,
  edit: EditState,
  quote: string,
  occurrence?: number,
): ResolveResult {
  const prog = programWords(t, edit)
  const tokens = quote.split(/\s+/).map(normalize).filter(Boolean)
  if (tokens.length === 0) return { wordIds: [], occurrences: 0 }

  const matches: string[][] = []
  const normWords = prog.map((w) => normalize(w.text))
  for (let i = 0; i + tokens.length <= prog.length; i++) {
    let ok = true
    for (let j = 0; j < tokens.length; j++) {
      if (normWords[i + j] !== tokens[j]) {
        ok = false
        break
      }
    }
    if (ok) matches.push(prog.slice(i, i + tokens.length).map((w) => w.id))
  }

  if (matches.length === 0) return { wordIds: [], occurrences: 0 }
  const pick = occurrence == null ? 1 : occurrence
  if (pick < 1 || pick > matches.length) return { wordIds: [], occurrences: matches.length }
  return { wordIds: matches[pick - 1], occurrences: matches.length }
}

/** Word ids whose text is one of the given filler words. */
export function findFillers(t: Transcript, edit: EditState, fillers: string[]): string[] {
  const set = new Set(fillers.map(normalize))
  return programWords(t, edit)
    .filter((w) => set.has(normalize(w.text)) && !edit.cut.has(w.id) && !edit.locked.has(w.id))
    .map((w) => w.id)
}

/** Gaps in the source longer than thresholdMs, for reporting to the agent. */
export function longGaps(t: Transcript, thresholdMs: number): { afterWordId: string; gapMs: number }[] {
  const out: { afterWordId: string; gapMs: number }[] = []
  for (let i = 0; i < t.words.length - 1; i++) {
    const gap = (t.words[i + 1].start - t.words[i].end) * 1000
    if (gap > thresholdMs) out.push({ afterWordId: t.words[i].id, gapMs: Math.round(gap) })
  }
  return out
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
