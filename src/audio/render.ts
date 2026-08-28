// Offline mixdown of an EDL timeline into a single set of PCM channels, plus a
// 16-bit WAV encoder. Used by the export tool and the one-click "download WAV".

import type { Timeline } from '../model/types'

const FADE_SEC = 0.004 // 4ms fade at cut boundaries to kill clicks

export interface Rendered {
  sampleRate: number
  channels: Float32Array[]
  length: number
}

export function renderTimeline(buffer: AudioBuffer, timeline: Timeline): Rendered {
  const sr = buffer.sampleRate
  const numCh = buffer.numberOfChannels
  const total = Math.max(1, Math.ceil(timeline.duration * sr))
  const out: Float32Array[] = []
  for (let c = 0; c < numCh; c++) out.push(new Float32Array(total))

  const fade = Math.max(1, Math.round(FADE_SEC * sr))
  const clips = timeline.clips

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const srcStartSample = Math.floor(clip.srcStart * sr)
    const outStartSample = Math.round(clip.outStart * sr)
    const n = Math.min(
      Math.round((clip.outEnd - clip.outStart) * sr),
      total - outStartSample,
    )
    if (n <= 0) continue

    const prev = clips[i - 1]
    const next = clips[i + 1]
    const fadeIn = !prev || Math.abs(clip.srcStart - prev.srcEnd) > 1e-4
    const fadeOut = !next || Math.abs(next.srcStart - clip.srcEnd) > 1e-4

    for (let c = 0; c < numCh; c++) {
      const src = buffer.getChannelData(c)
      const dst = out[c]
      for (let k = 0; k < n; k++) {
        const s = srcStartSample + k
        if (s < 0 || s >= src.length) continue
        let g = 1
        if (fadeIn && k < fade) g *= k / fade
        if (fadeOut && k >= n - fade) g *= (n - k) / fade
        dst[outStartSample + k] += src[s] * g
      }
    }
  }

  return { sampleRate: sr, channels: out, length: total }
}

export function encodeWav(r: Rendered): Blob {
  const { sampleRate, channels, length } = r
  const numCh = channels.length
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = length * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      let sample = channels[c][i]
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
