// Core data model for Papercut.
//
// The whole editor is a pure function of this state. Playback, the waveform,
// the transcript render, the duration counter and the WAV export are all
// derived from it, so the agent's WebMCP tools and the human's clicks only ever
// mutate this one structure and every surface updates in lockstep.

export interface Word {
  /** Stable id, unique across the whole transcript. */
  id: string
  /** The word text as spoken (may include trailing punctuation). */
  text: string
  /** Start time in the SOURCE audio, seconds. */
  start: number
  /** End time in the SOURCE audio, seconds. */
  end: number
  /** Index of the segment this word belongs to. */
  seg: number
}

export interface Segment {
  id: string
  /** Indices into the flat `words` array, in spoken order. */
  wordIds: string[]
  /** Optional chapter marker title attached at this segment boundary. */
  chapter?: string
}

export interface Transcript {
  words: Word[]
  segments: Segment[]
}

export interface EditState {
  /** Word ids the human has explicitly locked ("keep") — the agent must not cut them. */
  locked: Set<string>
  /** Word ids currently cut (struck through). */
  cut: Set<string>
  /**
   * Silence tightening ceiling, in milliseconds. Any gap between two kept words
   * longer than this is trimmed down to it. null = no tightening applied.
   */
  maxGapMs: number | null
  /** Segment order (segment ids). Reordering the podcast reorders this list. */
  order: string[]
}

/** One contiguous slice of source audio that survives into the output. */
export interface Clip {
  /** Source start time, seconds. */
  srcStart: number
  /** Source end time, seconds. */
  srcEnd: number
  /** Output start time, seconds (position in the edited timeline). */
  outStart: number
  /** Output end time, seconds. */
  outEnd: number
  /** Word id if this clip is a spoken word; undefined for a kept silence/gap. */
  wordId?: string
  kind: 'word' | 'gap'
}

export interface Timeline {
  clips: Clip[]
  /** Total edited duration, seconds. */
  duration: number
  /** Total source duration, seconds. */
  sourceDuration: number
}

/** A single entry in the visible agent-activity log. */
export interface ActivityEntry {
  id: number
  actor: 'agent' | 'human'
  tool: string
  detail: string
  /** Net change in edited duration this action caused, seconds (may be 0). */
  deltaSec: number
  t: number
}
