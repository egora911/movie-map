# History of Soul — production contract

Baseline recorded **2026-11-22**, main commit `326696baa1c09cf9e9bab924ff678ce3d688c896`.

- 58 works; 85 placement cards; one work with existing long human and GPT comments (`Disclaimer`).
- Work-level `origin` is preserved as-is; category IDs `me` / `her` remain stable.
- Existing current fields are materialized views: `reviews`, `review_dates`, `ai_comments`, `ai_comments_meta`, placement `actual`, `prediction` and `after`.
- Canonical person fields: `egor`, `anna`; AI joint field `together`.
- New append-only containers: `review_history.egor/anna`, `ai_comment_history.egor/anna/together`.
- Human event types: `original`, `addition`, `rewatch`, `legacy_current`. Last type is for migration of currently known content where first-event semantics are uncertain.
- GPT event types: `original`, `reinterpretation`, `taste_model_update`, `backfill`, `manual_revision`.
- Qualitative confidence: `tentative`, `developing`, `strong` (optional).
- Optional `history_current.review.egor/anna`, `history_current.ai.egor/anna/together` point to immutable event IDs. If omitted, latest event by array order/version is the fallback.
- `personValue(obj, 'egor')` reads canonical `egor` first then legacy `me`; `anna` first then `wife`. Leave this safety adapter during migration.
- Historic events are not hallucinated. `legacy_current` and `backfill` express what is actually stored, not a reconstructed earlier timeline. `after` remains current summary, never synthesized into history.
- Raw texts `before`, `after`, human reviews and all GPT comments must retain their original bytes.
- Validator: `node scripts/history-contract.cjs movies.json`; runs on every main push.
- Four sequential production commits, each gated by Vercel success and Chrome desktop/mobile/standalone checks. **No staging**.

The Movie Map authoring conversation (`30 ci chat`) remains the canonical source for later `#BACKFILL` and for subsequent GPT interpretations. UI never silently regenerates commentary.

## Completed production migration and UI history

- **Baseline:** `326696baa1c09cf9e9bab924ff678ce3d688c896`.
- **Stage 1:** canonical-first `personValue` compatibility, safe legacy fallback and strict history validator.
- **Stage 2:** actual UI/popup/agent person keys now use `egor` and `anna`; category IDs `me/her` are intentionally stable.
- **Stage 3 (data only):** `movies.json` schema v2; `reviews`, `review_dates`, `ai_comments`, `prediction`, `actual` use canonical identities. All 58 works have `review_history`, `ai_comment_history`, and `history_current`.
- Existing `Disclaimer` current state is represented by **two human `legacy_current` events** (exact raw text from existing work, recorded viewing date) and **three GPT `backfill` events** (verbatim current replies, version 1, original response date *not* inferred). `recorded_at` indicates the technical migration date, not the creation date.
- **Stage 4:** review popup defaults to the current materialized text. `🕰 История · N` shows an event timeline; selecting an item shows its complete untouched text with its date, type, rating/version, reason and qualitative confidence where present. `↩ Текущий взгляд` returns to the materialized state. GPT pair history is `ai_comment_history.together`.
- **Appending:** `scripts/history-events.cjs` exposes pure `appendHumanEvent(work,person,event)` and `appendAiEvent(work,person,event)`. They return a copied work, never silently edit production or invent content. `original` adds a first human event, `addition` appends a separate event and updates the materialized current text, `rewatch` creates a fresh review/rating and synchronizes actual scores across all placements; new GPT versions require an explicitly provided authored text and a reason (except original). Previous events remain untouched.
- Automated gates: `node scripts/history-contract.cjs movies.json`, `node tests/naming-audit.cjs`, `node tests/ux-smoke.cjs`, plus Chromium desktop/mobile + live production and autonomous HTML.
- **User texts** `before`, `after`, `reviews.*`, `ai_comments.*` and event `text` are never mass-rewritten for naming. `origin` is untouched.
- Historical `#BACKFILL` remains an explicit small-batch authoring action in `30 ci chat`, not an automatic site regeneration.

### Why this is versioned

The append-only arrays preserve the factual path of the user's reactions and GPT interpretation, while the materialized current fields remain fast to render and backwards compatible. The `history_current` pointers identify the selected version; if absent, readers fall back to the last event. The last human event can be an `addition` (delta text) while `reviews.egor/anna` contains the assembled current text; full raw additions remain separate in history.

### Naming safety

Only `egor/anna` (and `together` for a pair's GPT analysis) may appear in canonical personal data fields. The stable category IDs `me/her`, API protocol role `user`, and read-only adapters for legacy `me/wife` are explicitly exempt. Do not confuse stable category IDs with a person's canonical schema key.
