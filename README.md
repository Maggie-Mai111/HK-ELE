# HK-ELE Teacher Website

The teacher website supports vocabulary lookup, passage checking, word-family and form evidence, editable teaching lists and CSV, Markdown and Excel export. Teachers can report a problem or rate a word through the configured Google Forms. The local consent choice precedes the introductory Home page; usage-event collection and shared teacher accounts are not enabled in this candidate.

Browse and ordinary lookup default to **Full database**. **Core list** uses the existing product Candidate membership. Reference is a research comparison, not a teacher-facing scope. All 15 Browse columns remain directly available in the complete table. Older membership fields remain in the versioned data so saved teaching lists and data-update contracts retain compatibility.

AI interprets requested filters; the browser produces results from registered records after teacher review. AI defaults to the full database and can be restricted to Core list. It does not generate word records or infer missing evidence. A full search cannot silently fall back to the smaller saved word cache. The existing Worker request contract remains compatible: a small query adapter translates teacher scope labels for the interpreter, and the reviewed scope is executed locally. No Worker environment change is required by these frontend files.

## Lesson planning update — 19 October 2026

Teaching list now has one optional lesson name, compact rows showing the actual selected forms, and expandable editing. Teachers may leave the plan undecided, choose “Teach in depth”, or choose “Briefly introduce”. These describe teaching intentions, not learner attainment. Existing notes, related words, order, selected forms and legacy teaching-depth values are retained. The latter are kept separately and are not converted into the new plan.

After checking a passage, teachers can search within its matched words, tick the families they want and add the observed forms in one action. Nothing is selected automatically. Unmatched, ambiguous and blocked records are excluded from batch addition. A generic source label is saved locally; the passage and Known/Not known responses are not added to the saved list. This version supports one active lesson; it does not claim multiple saved lessons or cross-device sync.

Excel is the main export, with CSV and Markdown under More formats. Exports include the lesson name, selected words, plan and notes. Existing storage keys and stable family identities are preserved, so later approved data updates can refresh evidence while retaining teacher work. Feedback submissions remain a separate, explicit action through the existing Forms links.

## Data and updates

This candidate retains Package67, dated 14 September 2026: 163,784 families, 3,185 Core families, 163,570 ranked and 214 unranked. Later manuscript/research repairs have not been imported. Compound expressions remain an independent, unconnected supplemental data contract. They must not be inferred by splitting arbitrary words or by inventing family owners.

`data/ai_full_projection.json.gz` is an additional product-derived search view, not a new ranking or research data release. It contains all 163,784 family identities and aggregates registered morphology across their 319,924 form records. Its source result identity and population are checked against `data/manifest.json.gz` when loaded. The identical view is used by the App/PWA.

When approved base data changes, rebuild this view using `scripts/build_ai_projection.py` with an explicit data directory, frozen approved source directory, expected manifest SHA-256, data version and compatible CPB family-key index. The script checks every source shard, preserves frequency and membership values, writes a new output and records its input fingerprints. Review it alongside the new data release; do not point the UI directly at an edited Excel workbook or copy an older AI view into a new release.

## Local review and manual publication

Serve this directory over HTTP. `?ai_fixture=1` is a loopback-only testing mode for the confirmation and deterministic filtering flow; it makes no model requests and does not replace production service checks. Normal local mode hides AI when its runtime values are absent.

Preserve the existing deployment's `ai_runtime_config.js`. The registered website uses the production Worker. Copying or pushing source files does not itself confirm a live deployment. This iteration was prepared locally; no GitHub commit, push, Worker deployment or Pages publication was performed.
