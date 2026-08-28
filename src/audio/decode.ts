import { getAudioContext } from './context'

export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext()
  // decodeAudioData detaches the buffer in some engines; hand it a copy.
  return await ctx.decodeAudioData(data.slice(0))
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer()
  return decodeAudio(buf)
}

export async function fetchAndDecode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load audio: ${res.status}`)
  return decodeAudio(await res.arrayBuffer())
}
