# Recommendation Batches — production contract

- **Separate concerns:** `origin` records why a work entered the catalog; `recommendation_batches` identifies a recommendation search; `work.recommendations` is append-only event history.
- A work may be in multiple placement categories but must share one recommendation history.
- Batch `period` is YYYY-MM; use optional `created_at` only if the exact date is known.
- Events: `added` (first), `reconfirmed` (previously recommended and chosen again), `reprioritized` (changed priority). Never replace earlier events.
- Compact origin chip displays the period of the **last** event. Its title tooltip and the movie detail's built-in disclosure show **all** known events.
- The batch filter matches **any** event associated with that batch. A reconfirmed work remains in previous batch filters.
- Baseline: 58 works, 85 placements, 53 GPT origin works; historical Aug 2026 assignment is a user-provided month-level grouping, not fabricated individual event dates.
- New November template (do **not** record until the deep search is actually conducted): `{ "id":"rec_2026_11_deep_01", "period":"2026-11", "label":"Ноябрь 2026 · глубокий поиск", "source":"30_ci_chat", "type":"deep_recommendation_search" }`.
- Future additions must reuse existing work IDs; `scripts/recommendation-events.cjs` has pure append helpers. Updates are human-approved, never automatic.
- Validators: `node scripts/recommendation-contract.cjs movies.json` and existing History of Soul contract.
