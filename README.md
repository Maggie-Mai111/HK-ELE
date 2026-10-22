# HK-ELE Teacher Website

The approved Web v21 interface is retained with the A main product data release `2026-10-20-a-main-v1`: 163,906 Full family identities and 2,871 Core members. Exact spellings and family records remain available outside Core. Core is a research resource selection, not a pupil mastery requirement.

The Home markup and styles match the explicitly confirmed v21 delivery. External grade displays follow the exact displayed or selected word form, without substituting the family union or lowest grade. Missing list links display a dash.

The static reader uses the immutable generation under `data/releases/2026-10-20-a-main-v1/`, checking registered payload hashes before decoding. Full lookup, passage checking, teaching lists, exports and AI filtering use this generation. Teacher passages are retained without research dictionary filtering.

Web v32 adds the separate closed-compound release `2026-10-22-a-main-closed-v1` (57,881 registered expressions). The same search box and passage reader show a Compound card, recorded word parts and available component-family links. Whole compounds can be saved, annotated, rated and exported with independent expression IDs. No family, rank, grade or Core membership is inferred for a compound; existing family matches retain priority. Only recorded closed whole words match. Hyphenated and spaced expressions and generated inflections are outside this release. AI filtering continues to use its existing family projections and connection.

Saved lessons retain their existing storage keys; changed-owner selections keep the original spelling, identity and notes for review. No automatic push or deployment occurs. Preserve the site's existing `ai_runtime_config.js` when applying this update; its registered production Worker is unchanged.

The separate developer delivery records frozen inputs, full source comparisons, rollback and manual update instructions. Run `node --test tests/*.test.mjs` for the included portable checks.

Consistency closeout: selected-word records use the exact form for AWL/MSVL, textbook observations and word parts. Family frequency records and the approved layouts remain unchanged.
