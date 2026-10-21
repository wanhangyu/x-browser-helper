# Repository guidance

- Runtime source is in `extension/`. Keep the extension name and existing user storage keys stable.
- After changing `core.js`, `dom.js` or `content.js`, run `npm run build`. Keep package and manifest versions aligned.
- Run `npm test`, affected browser tests, and `npm run package` before delivery. Report synthetic versus real-page verification separately.
- Ordinary X timestamp anchors have `role="link"`; this alone does not identify a quote. `placementTracking` alone does not prove an advertisement. Preserve the heat regression coverage.
- Use synthetic fixtures and isolated browser profiles. Never commit credentials, real responses, personal browser profiles, or real timeline screenshots. Outputs belong in ignored `artifacts/` or `dist/`.
- Preserve third-party notices and licenses. Keep online translation optional and manual follow actions tied to trusted user clicks.
