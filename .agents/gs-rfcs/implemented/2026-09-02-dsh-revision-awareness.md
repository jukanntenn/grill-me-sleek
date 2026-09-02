# GS-RFC: dsh grilling revision awareness and session lifetime

English | [中文](2026-09-02-dsh-revision-awareness.zh.md)

Status: implemented

## Problem

The web answer page lets the user revise any answered round at any time while
the session is active — the button says "Update answers (notify AI)" and the
success banner says "the AI has been notified" — but nothing on the dsh side
could hear a revision. Three breaks, all on the receiving side:

1. `awaitResponse` discarded the 202 pending bodies, the only in-band signal
   the Hub already sent (a `revised` notice rides a pending response when a
   revision lands on another round while the caller is parked).
2. Once a tool call returned, no listener existed. A revision between calls
   reached nobody, ever — the page's promise was false in dsh mode.
3. The REST surface cannot even express "watch for revisions after every
   round is answered": parking a long-poll on an answered round returns 200
   immediately, and the `revised` notice only reaches callers parked on an
   *unanswered* round. The only stream carrying revisions between calls is
   the session's SSE feed.

Symmetrically, nothing ever closed a Hub session the plugin opened: failed or
aborted rounds cancelled it, but a concluded interview left the session
active until the one-hour TTL — a revision window with no listener attached.
And the convergence comment in the race called the recorded result "the
truth" while user edits existed only Hub-side: two directions, one truth
question.

## Decision

**The Hub is the source of truth for answers; everything the agent holds is a
cache.** The latest revision of each round — wherever the human expressed it,
answer page or winning card — is the decision. The session log is append-only
history, and the race's convergence semantics are unchanged (the race winner
is also a human expression, just a different surface). Convergence is layered
so that losing one layer never loses a revision (`dsh/src/`):

1. **The revision watcher** (`watch.ts`) — from the first successfully opened
   round, the plugin reads the session's SSE stream (`GET
   /v1/sessions/{id}/events`, the same stream the answer page uses). Each
   `response.revised` fetches that round's latest answers (`GET
   /rounds/{n}`) and delivers them to the agent out-of-band in the jobs
   pattern: an idle agent is woken with `followup`, a busy one is handed an
   `inject` for its next step boundary. Three consecutive idle wakes are
   allowed without a settled round between them (an answered round refills
   the budget); past that, deliveries park as injects. Every (re)connection
   replays the round summaries (`GET /rounds`) against the watermarks, so a
   missed event or a dropped stream heals by comparison — SSE carries no
   replay. Terminal events, a refused stream, agent disposal, or plugin
   disposal stop the watcher.
2. **The result delta** (`race.ts` `syncRevisions`) — before each new round
   opens, the plugin aligns the per-round revision watermarks with the Hub
   and carries newly revised rounds in the tool result's optional
   `revisions[]` field (round number, branch name, revision, full latest
   answers). This is also the convergence path when SSE is blocked.
3. **The wait notices** (`hub.ts` `awaitResponse`) — the long-poll loop now
   collects the `revised` notices 202 bodies carry, and the result delivers
   those rounds' latest answers too.

The watermark comparison collapses duplicates across layers: whichever layer
delivers first advances the watermark; the others skip. A failed or aborted
round cancels the Hub session and resets the linkage (`closeHubLink`), so the
next call opens a fresh session.

**There is no close action, and none is needed.** Sessions live to their TTL
(one hour on the public Hub), and that lifetime *is* the user's revision
window — deliberate, not an oversight. The one exception is agent disposal
(`index.ts`): a disposed agent can no longer hear revisions, so its watcher
stops and its session is cancelled best-effort — channel honesty, so the
answer page says "cancelled" instead of collecting revisions nobody will
read. The TTL sweeper is the final net when even that cancel is lost. The
runtime skill body (`skill.ts`) teaches the matching discipline: the latest
revision of every round supersedes earlier deliveries, and the model has no
close action and needs none.

Two implementation boundaries hold: no new runtime dependencies — Node has
no dependable global `EventSource` (undefined on Node 24, verified), so the
SSE reader is an in-repo fetch-body parser with reconnect and backoff, and
the notice message is constructed inline from a type-only `dsh-llm` import,
mirroring that package's factory. The server and web ship no changes — every
endpoint the plugin now uses already existed.

CLI parity (packaged skill revision discipline, `poll` exit output carrying
revised rounds, `complete` returning the consolidated record) is deliberately
out of scope and deferred to its own record.

## Alternatives considered

**Pull-only convergence (result delta, no watcher)** was rejected: revisions
between calls — including every revision after the interview concluded, the
most common "I changed my mind" moment — would stay invisible until a next
call that may never come, and the page's "the AI has been notified" promise
would remain false, merely with a delay. The layered design costs one SSE
connection per live grilling session against a 50 000-connection soft limit.

**A `grill_done` closing tool** (model-invoked conclusion: final full sync,
then `PATCH complete`, returning the consolidated record) was rejected on
direction: "the interview has reached shared understanding" is a semantic
judgment a tool cannot time precisely, and gating it through a second tool
reintroduces exactly the conditional-schema problem the construction-rules
checklist exists to absorb. The consolidated record also loses its carrier
once closing is automatic — which it is not, see the next alternative.

**Mechanical auto-close on turn end or idle** was rejected: a turn boundary
is not an interview boundary (multi-round interviews legitimately span
turns), and the revision window matters more than prompt closing — the user
called the lingering-until-TTL outcome harmless, explicitly. Auto-cancel on
*agent disposal* survives, because a dead agent is not a paused interview:
it is a channel with no listener, which should close honestly.

**A built-in or packaged EventSource** was rejected: no dependable Node
global exists, and a new runtime dependency for one parser is not worth the
ask-first boundary. The in-repo reader (~80 lines) also owns the
resync-on-reconnect discipline an off-the-shelf client does not provide.

**Fixing only the 202 discard** was rejected as incomplete: it covers
revisions that land while a round is pending, the least common window — the
between-calls window is where revisions actually go to die.

## Consequences

Revisions are now lossless in dsh mode: any revision on a live session
reaches the model through at least one of three layers, the watermark
comparison deduplicates, and after the session ends revisions are structurally
impossible (the Hub rejects them with 410). The answer page's promise is
true, dead channels close honestly, and the model's summarization discipline
is data-backed rather than memory-backed. The server and web ship zero
changes, and the runtime dependency graph stays at one package.

The costs: one SSE connection per live grilling session for its lifetime; the
wake budget means a long run of idle-period revisions parks as injects after
three wakes (delivered at the next step boundary — delayed, not lost);
deployments that block SSE degrade to next-call delivery; an agent that dies
without a clean disposal event (process crash) leaves its session to the TTL
sweeper; and the tool output schema grows the optional `revisions` field —
additive, but a model-facing contract change riders on. CLI-mode revision
semantics remain the deferred gap this record deliberately leaves open.
