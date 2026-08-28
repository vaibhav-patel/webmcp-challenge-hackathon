// Generates a rights-clean sample episode for Papercut with EXACT word-level
// timestamps — no transcription service needed. Each word is rendered on its own
// with macOS `say`, measured, and concatenated with real silence between words,
// so the transcript we emit lines up with the audio sample-for-sample.
//
// Usage: npm run gen:sample
// Output: public/samples/<slug>.wav  and  public/samples/<slug>.json

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VOICE = 'Samantha'
const SR = 44100
const GAP_WORD = 0.07 // natural gap between words in a sentence
const GAP_SENT = 0.35 // gap at the end of a sentence

// A P(n) token is a deliberate long pause of n seconds — material for the agent
// to tighten. Everything else is spoken. The script is intentionally full of
// filler words so "remove the ums" has a dramatic effect.
const P = (n) => ({ pause: n })

const SCRIPT = [
  {
    chapter: 'Cold open',
    tokens: ['so', 'um', 'i', 'finally', 'caved', 'and', 'bought', 'one', 'of', 'those', 'standing', 'desks', P(1.1), 'and', 'uh', 'honestly', 'i', 'was', 'kind', 'of', 'a', 'skeptic'],
  },
  {
    tokens: ['like', 'you', 'know', 'everybody', 'online', 'swears', 'by', 'them', P(0.9), 'but', 'um', 'i', 'just', 'figured', 'it', 'was', 'another', 'gadget', 'i', 'would', 'never', 'actually', 'use'],
  },
  {
    chapter: 'The first week',
    tokens: ['so', 'the', 'first', 'week', 'was', 'uh', 'was', 'rough', P(1.2), 'my', 'legs', 'were', 'sore', 'and', 'um', 'i', 'kept', 'sitting', 'back', 'down', 'out', 'of', 'habit'],
  },
  {
    tokens: ['you', 'know', 'i', 'mean', 'it', 'takes', 'a', 'while', 'to', 'uh', 'to', 'rewire', 'the', 'reflex', P(0.8), 'but', 'by', 'day', 'five', 'something', 'kind', 'of', 'clicked'],
  },
  {
    tokens: ['um', 'i', 'noticed', 'i', 'was', 'way', 'less', 'groggy', 'after', 'lunch', P(1.0), 'like', 'that', 'two', 'pm', 'crash', 'basically', 'just', 'disappeared'],
  },
  {
    chapter: 'What actually helped',
    tokens: ['so', 'the', 'thing', 'that', 'uh', 'really', 'made', 'the', 'difference', 'was', 'um', 'setting', 'a', 'timer', P(0.9), 'sit', 'for', 'thirty', 'and', 'then', 'stand', 'for', 'thirty'],
  },
  {
    tokens: ['and', 'you', 'know', 'i', 'stopped', 'trying', 'to', 'stand', 'all', 'day', P(0.8), 'because', 'honestly', 'that', 'was', 'um', 'that', 'was', 'a', 'terrible', 'idea'],
  },
  {
    tokens: ['like', 'your', 'body', 'just', 'wants', 'you', 'to', 'uh', 'to', 'move', 'not', 'to', 'lock', 'into', 'one', 'pose', P(1.1), 'whether', 'thats', 'sitting', 'or', 'standing'],
  },
  {
    chapter: 'Would I recommend it',
    tokens: ['so', 'um', 'would', 'i', 'recommend', 'it', P(0.7), 'yeah', 'i', 'think', 'so', 'but', 'uh', 'with', 'one', 'big', 'caveat'],
  },
  {
    tokens: ['dont', 'buy', 'the', 'you', 'know', 'the', 'four', 'hundred', 'dollar', 'one', 'right', 'away', P(1.0), 'um', 'get', 'a', 'cheap', 'converter', 'first', 'and', 'see', 'if', 'you', 'even', 'like', 'it'],
  },
  {
    tokens: ['because', 'like', 'half', 'the', 'people', 'i', 'know', 'who', 'uh', 'bought', 'the', 'fancy', 'one', P(0.9), 'basically', 'use', 'it', 'as', 'a', 'very', 'expensive', 'sitting', 'desk'],
  },
  {
    tokens: ['so', 'um', 'thats', 'my', 'thirty', 'day', 'report', P(0.8), 'uh', 'thanks', 'for', 'listening', 'and', 'you', 'know', 'ill', 'catch', 'you', 'next', 'week'],
  },
]

// Duration of a mono 16-bit PCM WAV, read straight from its 'data' chunk size.
// Avoids depending on ffprobe, which isn't always installed alongside ffmpeg.
function wavDuration(file) {
  const buf = readFileSync(file)
  let off = 12 // skip RIFF/size/WAVE
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') return size / (SR * 1 * 2)
    off += 8 + size + (size % 2)
  }
  return (buf.length - 44) / (SR * 1 * 2)
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), 'papercut-'))
  const outDir = join(process.cwd(), 'public', 'samples')
  mkdirSync(outDir, { recursive: true })
  const slug = 'standing-desk'

  const listLines = []
  const words = []
  const segments = []
  let cursor = 0
  let wIdx = 0
  let silIdx = 0

  const addSilence = (dur) => {
    if (dur <= 0) return
    const f = join(dir, `sil${silIdx++}.wav`)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i',
      `anullsrc=r=${SR}:cl=mono`, '-t', dur.toFixed(3), '-c:a', 'pcm_s16le', f])
    listLines.push(`file '${f}'`)
    cursor += dur
  }

  console.log(`Rendering ${SCRIPT.reduce((n, s) => n + s.tokens.filter((t) => typeof t === 'string').length, 0)} words with '${VOICE}'...`)

  SCRIPT.forEach((sent, si) => {
    const segId = `s${si}`
    const wordIds = []
    sent.tokens.forEach((tok) => {
      if (typeof tok !== 'string') {
        addSilence(tok.pause)
        return
      }
      const aiff = join(dir, `w${wIdx}.aiff`)
      const wav = join(dir, `w${wIdx}.wav`)
      execFileSync('say', ['-v', VOICE, '-o', aiff, tok])
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav])
      const dur = wavDuration(wav)
      const id = `w${wIdx}`
      const start = cursor
      const end = cursor + dur
      words.push({ id, text: tok, start: +start.toFixed(4), end: +end.toFixed(4), seg: si })
      wordIds.push(id)
      listLines.push(`file '${wav}'`)
      cursor = end
      wIdx++
      addSilence(GAP_WORD)
    })
    segments.push({ id: segId, wordIds, ...(sent.chapter ? { chapter: sent.chapter } : {}) })
    addSilence(GAP_SENT)
  })

  const listFile = join(dir, 'list.txt')
  writeFileSync(listFile, listLines.join('\n'))
  const wavOut = join(outDir, `${slug}.wav`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', wavOut])

  // Ship an mp3 for a small deploy footprint; decodeAudioData handles it fine.
  const mp3Out = join(outDir, `${slug}.mp3`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wavOut, '-codec:a', 'libmp3lame', '-q:a', '5', mp3Out])

  const project = {
    name: 'The 30-Day Standing Desk Report',
    audioUrl: `/samples/${slug}.mp3`,
    transcript: { words, segments },
  }
  writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(project, null, 2))
  rmSync(dir, { recursive: true, force: true })

  console.log(`Wrote ${wavOut}`)
  console.log(`Wrote ${join(outDir, `${slug}.json`)}`)
  console.log(`Duration ${cursor.toFixed(1)}s · ${words.length} words · ${segments.length} segments`)
}

main()
