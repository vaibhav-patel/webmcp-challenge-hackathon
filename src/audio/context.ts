// One shared AudioContext for decoding and playback.

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

export async function resumeAudio(): Promise<void> {
  const c = getAudioContext()
  if (c.state === 'suspended') await c.resume()
}
