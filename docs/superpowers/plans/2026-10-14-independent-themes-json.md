# Independent library themes and JSON downloads

Goal: vocabulary and sentence catalogs mutate independently; each AI entry downloads one JSON containing instructions, scoped snapshot and progress.
Architecture: retain settings.themes for vocabulary; introduce settings.sentenceThemes, falling back to the previous shared catalog until first catalog edit freezes both. Scoped import RPC v3 validates the changed catalog and preserves the other catalog. Old theme-changing requests are rejected after isolation. Existing word/sentence IDs and progress remain stable.

- [x] Add catalog selection/freezing helpers and scoped previews. Verify rename/delete/move do not affect the other catalog/content.
- [x] Update all theme consumers and both managers; scope vocabulary lists to vocabulary records.
- [x] Add and locally test RPC migration, including unchanged-other-catalog and old-client protection; deploy before frontend.
- [x] Download a JSON context document instead of clipboard text; keep batch import and single confirmation. Test downloaded JSON contents and browser flow.
- [ ] Review, full tests/build, deploy, verify published resources.
