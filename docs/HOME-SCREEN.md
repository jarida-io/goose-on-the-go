# Home: what Goose finished for you, then the house

Home answers two questions in order: does Goose have anything for me, and what is happening at
home. Since the Pond's idea engine (the Pond's `docs/architecture/idea-engine.md`), the first
answer is no longer composed chips or ideas from a background job. It is finished work Goose made
for the real things in the member's life (a trip, an event, a purchase, a project), the plans it
offers to follow, and the few questions it needs answered.

Verify before you reuse any of this: grep the symbol, the line numbers drift.

## 1. What is on the screen

[`app/(tabs)/index.tsx`](<../app/(tabs)/index.tsx>) draws, top to bottom:

1. **The greeting** and the avatar.
2. **Idea cards**, then **Goose has questions**: the newest open or waiting batch of structured
   questions (the Pond's `docs/architecture/structured-questions.md`), answered in place with the
   card in `components/goose/question-card.tsx`: one question a page, its header chip, its options
   with descriptions and Goose's pick first marked Recommended, the focused option's preview,
   **Other** with a field, **Done** and **Send**. A batch asked in a chat leads back to that chat,
   one asked for a plan to the plan. See all opens the questions screen. They sit above the board
   because, like the idea cards, they wait on the member.
3. **The Pond's line** (`PondSays`): reminders waiting, or "Nothing needs you right now", said only
   once every read that asks something of the member has answered with nothing. A failed read is
   not quiet. It is not drawn while a suggestion waits, which its own widget says.
4. **The glance strip**: devices on, the temperature and where. A figure the Pond has not answered
   for is left out.
5. **The Pond card and the setup offers**: whether the Pond can be reached, getting ready, finish
   setup, the interview, remote access. Each draws nothing once it is satisfied.
6. **The board** (`WidgetBoard`): every widget in the order this phone's owner chose, rearranged by
   a long press or "Edit Home". A widget with nothing true to say is left off the board. The
   default order (`HOME_WIDGETS` in `view-models/use-home-layout.ts`):

| Widget | What it says | Frame |
| --- | --- | --- |
| `ready` Ready for you | Unread finished work, up to three: the plan's name over the title and its one-line hook, "Goose isn't sure about this one" when its critic still objected. A tap opens the deliverable, which marks it read. | raised |
| `plans` Shall Goose follow these? | Plans Goose offered (candidate anchors), up to two: what it is, why Goose thinks so, **Yes, follow it** and **Not now**, decided in place. | raised |
| `ideas` From your Pond | Proposals waiting on a yes (a device change, a booking, anything that spends or sends) and an agent the Pond could run. | raised while a proposal waits |
| `ask` Ask Goose | A field that opens a conversation, and what a new chat would offer to ask. | plain |
| `music`, `next`, `outside`, `remember` | Now playing, the next routine, the weather, reminders lifted from chats. | accent / plain |
| `conversations`, `devices` | The last three conversations; up to six devices. | plain |

The first two, the idea cards and the questions come from `useHomeEngine` (`view-models/use-home-engine.ts`), which reads
`GET /me/anchors` and `GET /me/questions` only when `GET /me/hub` says the Pond serves `anchors`
and `questions`. An older Pond's Home is the board it always was, without them.

`ready` is `readyWork` in `models/anchors.ts`: deliverables that are `ready` or `unsure` and
`unseen`, of the member's own anchors that are active or offered. A shared anchor's work shows on
its owner's Home, not on the member it is shared with. `plans` is `candidates`: anchors in state
`candidate` that the member owns.

A saved order from before these widgets existed keeps its arrangement and gains the two at its
head, because `mergeOrder` puts a new widget after the one it follows by default; one saved while
the questions were a widget drops them, since they are no longer on the board.

## 2. Where each part leads

| From | To |
| --- | --- |
| A ready card | `/(stack)/goose-deliverable`: the document, facts at a glance, sources, what changed, the critic's objections when unsure, Make it again, Share the file, Not for me. |
| An offered plan's words | `/(stack)/goose-anchor`: facts, what Goose made, the running job's steps, its questions, sharing and Stop. |
| More ready, more offers | `/(stack)/goose-plans`: offers, the plans the member follows, the ones shared with them, and Add a plan. |
| See all questions | `/(stack)/goose-questions`, every open and waiting batch. |
| Open the chat, on a chat batch | `/conversation` with that session. |

The same three reach the member from notifications (`docs/NOTIFICATIONS.md`) and from My Goose,
whose "Plans and things you follow" section leads with them.

## 3. The constraints that decide the work

1. **A yes on Home is safe only because of what it does.** Confirming a plan starts research and
   drafting, which the Pond runs unasked anyway; booking, sending, spending and device changes stay
   proposals the member approves, in `ideas`. A proposal's yes runs nothing either
   (`ProposalDecisionResult.executed` is always false).
2. **Answering in place sends exactly what was chosen, the whole batch at once.** A choice is an
   option's label and Other's words go as `text`; `batchAnswerBody` in
   `view-models/use-questions.ts` builds `POST /me/questions/batches/{id}/answer`, with only the
   questions answered. A Pond without that route gets each answer on its own. A sent or ended
   (Done) batch leaves the widget at once.
3. **A read that failed is not an empty list.** The engine's widgets are left off the board while
   their read has failed, and the Pond's line says nothing rather than "Nothing needs you".
4. **Not polled hard.** Plans and questions move on the Pond's schedule: every two minutes while
   Home is in front, every twenty seconds while a job runs, and on the pull to refresh.
5. **Strings carried as data are `TranslationKey`**, and new keys live under `home.ready`,
   `home.plans` and `home.questions`. `t()` is never called at module scope.
6. **The bottom bar reserves its own strip**: Home clears it with `paddingBottom:
   useBottomBarInset()`, never a spacer.
7. **`InkCard` already has a face and a plate**: a card's own style carries layout only. The
   board draws the widgets' frames; a widget draws its content.

## 4. What this should not become

- **Not a feed.** Three ready cards, two offers, one batch of questions; the rest behind a tap.
- **Not a second inbox for the same thing.** Opening a deliverable marks it read, and the Pond's
  "ready" suggestion and notice go with it.
- **Not auto-approved.** Nothing on Home books, spends, sends or changes a device.
