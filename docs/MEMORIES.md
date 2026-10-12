# Memories

The Memories screen reads and writes the Pond's own `MemoryFragment`
(`pond-core/src/user_data/domain/memory.rs` in goose-in-a-pond). It used to show a mock
with `category`, `pinned`, `icon` and `time`, none of which exist on the Pond. This page
records how those ideas map onto real fields, and what the Pond would need for the one
that does not map yet.

## Routes

| Method | Path | Used for |
|---|---|---|
| GET | `/api/v1/memories` | The list: the household's 50 most recent. No limit or filter is taken. |
| POST | `/api/v1/memories` | Add: `content`, and optionally `segment` and `tier`. |
| PUT | `/api/v1/memories/{id}` | Reword: `content` only. |
| DELETE | `/api/v1/memories/{id}` | Forget. |
| POST | `/api/v1/memory/consolidate` | Tidy up now. Streams each stage as server-sent events. |
| POST | `/api/v1/memory/consolidate/stop` | Stop a tidy-up between stages. |

## How the screen's ideas map

| On screen | Pond field | Why |
|---|---|---|
| Filter chips | `segment` | The Pond classifies every extracted memory into one of eight segments, and the segment sets its default importance and tier. Only segments that appear in the list are offered. |
| "Kept" badge | `tier == "permanent"` | Decay cleanup skips the permanent tier: it is never archived or pruned for age. That is most of what "pinned" was meant to promise; see below for the rest. |
| Date | `created_at` | |

**Not a reserved tag, not an importance threshold.** Decay cleanup reads `tier`,
`importance`, `decay_rate` and `access_count`; it never reads tags. A `pinned` tag
would look pinned on the phone while the memory faded and was archived on the Pond. A
threshold on `importance` would not stop decay either, because decay multiplies importance
down over time regardless.

**The old "Reminder" chip is gone.** Reminders are their own table and route
(`/api/v1/reminders`), not a kind of memory.

**The old icon is gone.** It was decoration chosen per mock entry; the segment badge
carries the same information.

## What needs the Pond

A memory can be kept forever when it is **added** (`POST` takes `tier`). It cannot be kept,
or un-kept, **afterwards**: `PUT /memories/{id}` reads only `content`. So "Kept" is shown but
cannot be toggled on an existing memory.

Requested from goose-in-a-pond: let `PUT /api/v1/memories/{id}` also take optional `tier`
(and, for the same reason, `segment` and `importance`), recomputing `decay_rate` from the
tier as `save_memory` does, and leaving any field that is absent as it is. Once that
lands, the card can carry a Keep switch.

Consolidation does not check the tier: it exempts corrections from pruning and merging,
and nothing else. So a kept memory is safe from fading but can still be merged with a
near-duplicate, or pruned, by a tidy-up. Requested alongside: give the permanent tier the
same exemption from pruning that corrections have. Until then the Keep hint says a tidy-up
can still merge a kept memory.

## Consolidation progress

A tidy-up started on the phone shows each stage as the Pond reports it: reviewing, the
suggested changes being challenged, the judge ruling, and the accepted changes being
applied, then a tally. The list reloads when it ends.

The Pond also runs consolidation on its own timer when `memory_consolidation_enabled` is
on, but it has no route that reports a run already going, so those runs are not shown.
A `501` means consolidation is switched off in the Pond's settings or missing from its
build.
