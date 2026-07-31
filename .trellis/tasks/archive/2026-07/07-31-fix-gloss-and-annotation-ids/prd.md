# Fix gloss failures with reasoning models and cross-session annotation id collisions

## Goal

Fix the two user-reported bugs: (1) gloss/translation requests coming back empty with
reasoning models, and (2) annotations getting corrupted or deleted after an app restart.

## Background

Both bugs were root-caused via live API replay against the user's actual stored
settings (DeepSeek `deepseek-v4-flash`) and inspection of the packaged app's WebKit
localStorage:

1. **Gloss/translation empty.** `src/lib/aiService.ts` hardcodes `max_tokens: 256`.
   Reasoning models count chain-of-thought tokens against this cap; reasoning alone
   regularly exceeds 256 tokens, so the API returns `finish_reason: "length"` with an
   empty `content`, and the app shows 无法获取释义 / 无法获取翻译. Verified: the same
   request at `max_tokens: 2048` returns a complete translation (389 reasoning tokens
   + full content).

2. **Annotation corruption across restarts.** `createGlossAnnotationId()` in
   `src/lib/glossAnnotations.ts` uses a module-level counter that resets to 0 on every
   launch, so new-session ids collide with stored ids (`gloss-1`, `gloss-2`, …).
   Confirmed in the user's store (duplicate gloss-1/3/5 with cross-contaminated
   definitions). Consequences: definition updates by id overwrite the stored annotation
   sharing the id; delete-by-id removes both; colliding group ids let group edit/collapse
   hit stale groups. Side translations never collided because `createTranslationId()`
   already uses `Date.now()` + random.

## Requirements

- R1: Raise the completion cap in `requestCompletion` from 256 to 2048 so reasoning
  models can finish (glosses stay short; cost impact negligible).
- R2: When the API returns HTTP 200 but empty `content` (e.g. truncated by length),
  throw a descriptive error instead of silently resolving to 无法获取释义/翻译.
- R3: Make `createGlossAnnotationId()` collision-free across app launches
  (timestamp + in-session counter, mirroring the translation id scheme).
- R4: On load of stored annotations, reassign a fresh unique id to any duplicate ids
  already persisted by the old scheme so existing stores stop cascading corruption.
  Group membership (`groupId` field) must be preserved.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] Ids generated in different simulated sessions can no longer collide; loading a
      stored doc with duplicated ids yields all-unique ids with groupIds/definitions
      unchanged.
- [ ] A paragraph translation via deepseek-v4-flash completes (API replay at the new
      max_tokens verified during diagnosis).

## Out of Scope

- Un-mixing definitions already overwritten in the user's store (data loss; user
  re-glosses those words).
- Splitting stored groups whose groupId was merged across sessions.
- Provider-specific reasoning controls (e.g. disabling thinking mode).
- Version bump / release (release flow is tag-driven, handled separately).
