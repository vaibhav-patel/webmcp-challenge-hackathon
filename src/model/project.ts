// Loading projects into the store: the bundled sample and user uploads. Accepts
// Papercut's native format and word-level Whisper JSON so anyone can bring their
// own episode (audio file + transcript).

import { decodeAudioFile, fetchAndDecode } from '../audio/decode'
import type { Project } from './store'
import type { Segment, Transcript, Word } from './types'

interface NativeFile {
  name?: string
  audioUrl?: string
  transcript: { words: Word[]; segments: Segment[] }
}

interface WhisperWord {
  word?: string
  text?: string
  start: number
  end: number
}
interface WhisperSeg {
  text?: string
  words?: WhisperWord[]
}

export async function loadSampleProject(jsonUrl = '/samples/standing-desk.json'): Promise<Project> {
  const res = await fetch(jsonUrl)
  if (!res.ok) throw new Error(`Sample transcript not found (${res.status}).`)
  const data = (await res.json()) as NativeFile
  const buffer = await fetchAndDecode(data.audioUrl!)
  return {
    name: data.name ?? 'Sample episode',
    transcript: normalizeTranscript(data),
    buffer,
    audioUrl: data.audioUrl,
  }
}

export async function loadUploadedProject(transcriptFile: File, audioFile: File): Promise<Project> {
  const json = JSON.parse(await transcriptFile.text())
  const buffer = await decodeAudioFile(audioFile)
  return {
    name: json.name ?? audioFile.name.replace(/\.[^.]+$/, ''),
    transcript: normalizeTranscript(json),
    buffer,
  }
}

function normalizeTranscript(json: unknown): Transcript {
  const j = json as Record<string, unknown>

  // Native Papercut format.
  if (j.transcript && (j.transcript as { words?: unknown }).words) {
    const t = j.transcript as { words: Word[]; segments: Segment[] }
    return { words: t.words, segments: t.segments }
  }
  if (Array.isArray(j.words) && Array.isArray(j.segments) && (j.segments as Segment[])[0]?.wordIds) {
    return { words: j.words as Word[], segments: j.segments as Segment[] }
  }

  // Whisper-style: segments each with a words[] array.
  if (Array.isArray(j.segments) && (j.segments as WhisperSeg[])[0]?.words) {
    const words: Word[] = []
    const segments: Segment[] = []
    ;(j.segments as WhisperSeg[]).forEach((seg, si) => {
      const wordIds: string[] = []
      ;(seg.words ?? []).forEach((w) => {
        const id = `w${words.length}`
        words.push({ id, text: (w.word ?? w.text ?? '').trim(), start: w.start, end: w.end, seg: si })
        wordIds.push(id)
      })
      segments.push({ id: `s${si}`, wordIds })
    })
    return { words, segments }
  }

  // Flat word list: chunk into segments of ~18 words for readability.
  if (Array.isArray(j.words)) {
    const words: Word[] = []
    const segments: Segment[] = []
    let seg: Segment = { id: 's0', wordIds: [] }
    ;(j.words as WhisperWord[]).forEach((w, i) => {
      if (i > 0 && i % 18 === 0) {
        segments.push(seg)
        seg = { id: `s${segments.length}`, wordIds: [] }
      }
      const id = `w${i}`
      words.push({ id, text: (w.word ?? w.text ?? '').trim(), start: w.start, end: w.end, seg: segments.length })
      seg.wordIds.push(id)
    })
    segments.push(seg)
    return { words, segments }
  }

  throw new Error('Unrecognized transcript format. Expected Papercut native or word-level Whisper JSON.')
}
