# ✂ Papercut

**Edit a podcast by striking through its transcript — together with your agent.**

**▶ Live app: https://webmcp-challenge-six.vercel.app** — open it in ChatGPT's in-app browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.

Papercut is a transcript-first audio editor built for the [WebMCP Challenge](https://webmcp.devpost.com). You listen; your agent edits. Ask it to *"remove all the ums and tighten every pause over half a second"* and it strikes filler and dead air out of the transcript in one pass — the words get a line through them, the waveform compacts, and the running time drops from **2:21 to 2:00** in front of you. Click any struck word to bring it back. Lock a word and the agent won't touch it. When it's right, export a finished WAV — rendered entirely in your browser.

It's Descript-style transcript editing, except the editor's hands are visible WebMCP tool calls on the very audio session you're auditioning.

## Why this is a strong fit for WebMCP

The edit only exists in the page. The edit-decision list, the decoded audio buffer, the playhead, the human's restores and keep-locks all live in the tab's memory — **there is no server that holds this session**, and a chatbot can't scrub audio or ripple a strikethrough through a transcript. WebMCP is the only thing that lets an agent reach into that live, in-memory session:

- **The agent and the human edit the same object.** Every tool routes through one store, so a cut the agent makes and a restore the human clicks are the same kind of event — the transcript, waveform and duration counter update identically no matter who acted.
- **It's genuinely collaborative, not automation.** The agent does the tedious pass (find and cut 29 fillers, trim 23 long pauses, drop a tangent by transcript search). The human does the taste pass (audition at the playhead, restore a word, paint keep-locks). `get_edit_state` reports *what the human changed since the agent last looked*, so the agent plans around human judgment instead of stomping it.
- **Neither could finish alone.** The agent can't hear what sounds natural; the human won't strike 200 ums by hand.

This was awkward-to-impossible before: an agent that operates your actual editing session, live, while you keep full visual control and veto power.

## What the agent can do (the WebMCP tools)

All tools are registered with `document.modelContext.registerTool(...)` and defined in [`src/webmcp/tools.ts`](src/webmcp/tools.ts). They point at words by **quoting them** (with an `occurrence` number when a phrase repeats) so the agent never has to guess at internal ids.

| Tool | What it does |
| --- | --- |
| `get_transcript` | Read the episode as ordered segments (marked `untrustedContentHint` — transcript text is treated as data, never instructions) |
| `get_edit_state` | Current vs. source duration, cut/lock counts, **and the human's edits since the last call** |
| `cut_words` | Strike through a word or exact phrase |
| `restore_range` | Bring cut words back |
| `remove_filler_words` | Sweep the whole episode for ums/uhs (custom list supported); skips locked words |
| `tighten_silences` | Trim every pause longer than `max_gap_ms` |
| `cut_between` | Cut a whole tangent from one marker phrase to another |
| `reorder_segments` | Reorder the episode (e.g. lead with the recommendation) |
| `add_chapter_marker` | Attach chapter titles |

`get_transcript`/`get_edit_state` are marked `readOnlyHint`. Locked words are never cut, by any tool — the human's veto is enforced in the store, not left to the model.

## How it's implemented

Client-side only, no backend. The interesting part is the **EDL (edit-decision-list) engine** in [`src/model/timeline.ts`](src/model/timeline.ts): a pure function turns `(transcript + edit state)` into a list of source→output clips, and *everything* derives from it — the [Web Audio player](src/audio/player.ts) schedules one buffer source per kept clip with tiny fades at cut boundaries, the [canvas waveform](src/ui/Waveform.tsx) colors cut regions red as they spread, the duration counter reads its length, and the [in-browser WAV export](src/audio/render.ts) mixes it down sample-by-sample.

- **Stack:** Vite + React + TypeScript, Web Audio API, `<canvas>`. No audio libraries.
- **State:** one observable [store](src/model/store.ts) shared by React (`useSyncExternalStore`) and the WebMCP tool handlers.
- **WebMCP:** a [defensive wrapper](src/webmcp/register.ts) feature-detects `document.modelContext` (current spec / Chrome / ChatGPT) and falls back to `navigator.modelContext` (early Chrome preview).
- **Origin isolation:** WebMCP requires an origin-isolated document, so every response sends `Origin-Agent-Cluster: ?1` (via [`public/_headers`](public/_headers), [`vercel.json`](vercel.json), and the Vite dev/preview server).

## Run it locally

```bash
npm install
npm run gen:sample   # optional: regenerate the bundled sample episode (needs macOS `say` + ffmpeg)
npm run dev
```

Then open the app in one of:

- **ChatGPT's in-app browser** (desktop app) — WebMCP "Site tools" are supported out of the box.
- **Google Chrome 149+** with `chrome://flags/#enable-webmcp-testing` enabled. Use the *Model Context Tool Inspector* extension or DevTools ▸ Application ▸ WebMCP to drive the tools.

Bring your own episode with the **Transcript…** + **Audio…** buttons: any audio file plus a word-level transcript (Papercut's native JSON or word-level Whisper JSON).

## The sample episode

[`scripts/gen-sample.mjs`](scripts/gen-sample.mjs) generates a rights-clean sample (`public/samples/standing-desk.*`) with **exact word-level timestamps and no transcription service**: each word is rendered on its own with macOS `say`, measured, and concatenated with real silence, so the transcript lines up with the audio sample-for-sample. It's deliberately full of fillers and long pauses so the agent's first pass is dramatic.

## License

MIT — see [LICENSE](LICENSE).
