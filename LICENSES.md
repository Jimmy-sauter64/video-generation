# Brand Asset Provenance & Licenses

Provenance for every vendored asset under `assets/brand/`, per the Pay
Theory brand kit build (2026-08-26).

## Vendored assets

| Asset                             | Destination                             | Source path                                                             | Owner      | Date vendored |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- | ---------- | ------------- |
| Logomark (SVG)                    | `assets/brand/pay-theory-logomark.svg`  | `~/Claude/GitHub/aigtm/apps/demo/public/assets/pay-theory-logomark.svg` | Pay Theory | 2026-08-26    |
| Full logo lockup (PNG, 1080x1080) | `assets/brand/pay-theory-logo-1080.png` | `~/Claude/Downloads-Archive/2026-06/assets/Paytheory Logo.png`          | Pay Theory | 2026-08-26    |

Both assets are Pay Theory-owned brand materials, copied from existing
internal repositories/archives — no third-party license applies.

## Fonts

| Name            | Version                                 | License                   | Source URL                                                   | Files vendored                                                                                                                                                           |
| --------------- | --------------------------------------- | ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instrument Sans | v4 (Fontsource, per api.fontsource.org) | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/instrumentsans | `assets/brand/fonts/instrument-sans-400.woff2`, `-500.woff2`, `-600.woff2`, `-700.woff2` (all under `assets/brand/fonts/`), license text at `assets/brand/fonts/OFL.txt` |

Instrument Sans is used as a free OFL-licensed stand-in for Halyard (the
reference brand typeface, not freely licensable). See
`src/brand/brand.md` for the selection rationale. All four published weights
are now vendored — the upstream family publishes 400/500/600/700 and no
800/900 (confirmed via the Fontsource API).

Weights 400 and 600 were added on 2026-08-26 for the exemplar-style rebuild:
`docs/style/exemplar-analysis.md` L3 requires headline type at 500–600 and
forbids 700+, and only 500/700 had been vendored previously. 700 remains
vendored but is no longer referenced by any scene.

Font files fetched from the jsDelivr Fontsource CDN:

- https://cdn.jsdelivr.net/fontsource/fonts/instrument-sans@latest/latin-400-normal.woff2
- https://cdn.jsdelivr.net/fontsource/fonts/instrument-sans@latest/latin-500-normal.woff2
- https://cdn.jsdelivr.net/fontsource/fonts/instrument-sans@latest/latin-600-normal.woff2
- https://cdn.jsdelivr.net/fontsource/fonts/instrument-sans@latest/latin-700-normal.woff2

License text fetched from the `google/fonts` GitHub repository.
