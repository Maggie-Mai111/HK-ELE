# HK-ELE Teacher Database Web

HK-ELE helps teachers find vocabulary, check classroom passages and build teaching lists using word-family information and evidence from English corpora and Hong Kong textbooks.

## Teacher preview changes

- An explicit data-choice screen opens before Home. The choice can be reviewed and withdrawn.
- Home introduces the product and links to Find words, Check a text and Teaching list.
- Problem-report and word-rating entry points connect to the owner's Google Forms. HK-ELE automatically fills one reference field with the current word, page and versions.
- Clearer word and text results distinguish missing data matches from context checks.
- Search and text edits invalidate stale results; advanced information opens on demand.

## Data and participation

Product data remains Package67, dated 14 September 2026: 163,784 identities, Candidate 3,185 and inclusive Reference 3,430. Later research repairs have not been imported. The supplementary expression contract is reserved for a future approved release; compound records have not been added.

The data-choice screen saves a choice on this device only. Usage-event collection and teacher accounts are not connected. Formal research participation requires its own information and confirmation. Feedback is sent only when the teacher submits the connected Google Form. Opening a form does not mean a response was received. Receipt in the owner's linked Sheets still needs a marked test submission.

## Runtime configuration

Keep the existing `ai_runtime_config.js`, which connects this Web product to the registered production Worker. This overlay does not replace that file or change the backend environment.

Configure feedback URLs and prefill mappings in `feedback_forms.json`. Serve the repository root with a static HTTP server for local use. GitHub Pages publication follows the publishing source selected in the repository's Pages settings.

## Validation and deployment status

The source candidate passed 118 App regression tests and its local PWA export on 14 October 2026. Four actual Google prefill initialization responses were checked for Web/App report/rating links. Local App rating entry and destination opening were checked; remote Google visual interaction timed out, so real submission and linked Sheets receipt are not claimed. This source update does not itself declare a successful public deployment. Use the actual GitHub Actions and Pages deployment record to identify the deployed commit.

Licence and source attribution notices remain in the repository. Historical package and deployment records refer to their original versions.
