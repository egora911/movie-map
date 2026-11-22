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
