# HK-ELE Teacher Website

The approved Web v21 interface is retained with the A main product data release `2026-10-20-a-main-v1`: 163,906 Full family identities and 2,871 Core members. Exact spellings and family records remain available outside Core. Core is a research resource selection, not a pupil mastery requirement.

The Home markup and styles match the explicitly confirmed v21 delivery. External grade displays follow the exact displayed or selected word form, without substituting the family union or lowest grade. Missing list links display a dash.

The static reader uses the immutable generation under `data/releases/2026-10-20-a-main-v1/`, checking registered payload hashes before decoding. Full lookup, passage checking, teaching lists, exports and AI filtering use this generation. Teacher passages are retained without research dictionary filtering. No compound layer or new family inference is added.

Saved lessons retain their existing storage keys; changed-owner selections keep the original spelling, identity and notes for review. No automatic push or deployment occurs. Preserve the site's existing `ai_runtime_config.js` when applying this update; its registered production Worker is unchanged.

The separate developer delivery records frozen inputs, full source comparisons, rollback and manual update instructions. Run `node --test tests/*.test.mjs` for the included portable checks.
