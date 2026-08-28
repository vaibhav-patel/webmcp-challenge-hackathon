# Papercut — WebMCP Challenge submission

Copy-paste material for the Devpost form, plus the demo-video script.

**Live URL:** https://webmcp-challenge-six.vercel.app
**Repo:** https://github.com/vaibhav-patel/webmcp-challenge-hackathon
**Demo video:** _<paste YouTube link>_

---

## Elevator pitch (one line)

Papercut lets you edit a podcast by striking words out of its transcript — your agent does the tedious filler-and-silence pass on the live audio session while you listen, restore, and lock the words that stay.

## What it does

Papercut is a transcript-first audio editor. You load an episode (a bundled sample, or your own audio + word-level transcript) and see the transcript beside a waveform. Tell your agent *"remove all the ums and tighten every pause over half a second"* and it strikes filler words and dead air out of the transcript in one pass: the words get a red line through them, the waveform reddens and compacts, and the running time drops from **2:21 to 2:00** in front of you. Click any struck word to bring it back. ⌘/Ctrl-click a word to **lock** it so the agent can't touch it. When it sounds right, **Export WAV** renders the finished cut entirely in the browser.

## Why this is a strong fit for WebMCP

The edit exists only in the page. The edit-decision list, the decoded audio buffer, the playhead, and the human's restores and keep-locks all live in the tab's memory — **there is no server that holds this session**, and a chatbot can't scrub audio or ripple a strikethrough through a transcript. WebMCP is the only thing that lets an agent operate that live, in-memory editing session:

- The agent and the human mutate the **same object**. Every tool routes through one store, so an agent's cut and a human's restore are the same kind of event and every surface — transcript, waveform, counter — updates identically.
- It's **collaboration, not automation**. `get_edit_state` reports *what the human changed since the agent last looked*, so the agent plans around human taste instead of overwriting it. Locked words are protected in the store — the human's veto is enforced, not left to the model's goodwill.

## How it creates a better user experience

Transcript editors like Descript already let humans cut audio by editing text. Papercut removes the tedious part: instead of you hunting 200 ums and dragging pause handles, you *speak the intent* and watch it happen on the exact session you're auditioning, keeping frame-by-frame veto power. The agent handles volume and search ("cut the tangent about the $400 desk"); you handle judgment ("that pause is intentional — locked").

## What people and agents can do together that was hard/impossible before

An agent that operates your actual editing session, live, while you keep full visual control:

- The agent strikes 29 fillers and trims 23 long pauses in one call; you hear the result and restore the two you liked.
- You lock "skeptic"; the agent's next filler sweep leaves it in and *tells you it was locked*.
- You reorder by hand; the agent reads that change back via `get_edit_state` and continues from it.

Neither could finish alone: the agent can't hear what sounds natural; you won't strike 200 ums by hand.

## How we implemented WebMCP

Client-side only, no backend. Tools are registered with `document.modelContext.registerTool(...)` (see `src/webmcp/tools.ts`) and point at words by **quoting them** (with an `occurrence` number when a phrase repeats), so the agent never guesses at internal ids.

Nine tools: `get_transcript` (marked `untrustedContentHint` — transcript text is data, never instructions) and `get_edit_state` (both `readOnlyHint`) for reading; `cut_words`, `restore_range`, `remove_filler_words`, `tighten_silences`, `cut_between`, `reorder_segments`, `add_chapter_marker` for editing.

- **EDL engine** (`src/model/timeline.ts`): a pure function turns `(transcript + edit state)` into source→output clips; the Web Audio player, canvas waveform, duration counter, and WAV export all derive from it.
- **Shared store** (`src/model/store.ts`): one observable used by React (`useSyncExternalStore`) and the tool handlers, so human and agent edits are the same event.
- **Feature detection** (`src/webmcp/register.ts`): `document.modelContext` with a `navigator.modelContext` fallback for the early Chrome preview.
- **Origin isolation**: WebMCP requires an origin-isolated document, so every response sends `Origin-Agent-Cluster: ?1` (via `vercel.json`, `public/_headers`, and the Vite server).

**Stack:** Vite + React + TypeScript, Web Audio API, `<canvas>`. No audio libraries.

## How to test it

- **ChatGPT in-app browser** (desktop app): open the live URL; WebMCP "Site tools" work out of the box. Ask it to remove the ums.
- **Chrome 149+**: enable `chrome://flags/#enable-webmcp-testing`, open the URL, and drive the tools via the Model Context Tool Inspector extension or DevTools ▸ Application ▸ WebMCP.

---

## Demo video script (target ~2:45, hard cap 3:00)

Record with the bundled sample already loaded. Speak clearly; no copyrighted music.

**0:00–0:15 — Hook.** *"This is Papercut. It edits a podcast by striking words out of the transcript — and the editor's hands are my AI agent. Watch."* (Show the app: transcript left, waveform, 2:21 counter.)

**0:15–0:45 — The money shot.** Type to the agent: **"Remove all the ums and tighten every pause over half a second."** As it runs, narrate: *"Every one of these is a real WebMCP tool call on the live audio in this tab."* On screen: dozens of red strikethroughs cascade down, the waveform reddens and compacts, the counter rolls **2:21 → 2:00**, and the Activity panel logs `remove_filler_words −0:15`, `tighten_silences −0:06`.

**0:45–1:10 — Human in the loop.** Click a struck word to restore it (counter ticks up). ⌘-click "skeptic" to lock it (blue underline). *"I keep full control — click to restore, lock the words that stay."*

**1:10–1:35 — The collaboration proof.** Ask the agent: **"Remove the ums again, and don't touch anything I locked."** Show the agent's reply noting the locked word was left in. *"It can see what I changed by hand — the lock is enforced, not suggested."*

**1:35–2:00 — Volume + search.** Ask: **"Cut the tangent about the four hundred dollar desk."** The `cut_between` call greys out a whole passage. *"One sentence removes a whole tangent — by meaning, not timestamps."*

**2:00–2:25 — Reorder + why WebMCP.** Ask: **"Reorder to lead with the recommendation."** Segments reflow. Narrate the point: *"This session only exists in the page — the audio buffer, the edit list, my locks. No server holds it, and a chatbot can't scrub audio. WebMCP is what lets the agent reach in and edit the exact thing I'm listening to."*

**2:25–2:45 — Payoff.** Click **Export WAV**; the file downloads. *"And it renders the finished cut right in the browser. That's Papercut — a podcast editor you and your agent run together."*
