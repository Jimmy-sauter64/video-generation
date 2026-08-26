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

| Name            | Version                                 | License                   | Source URL                                                   | Files vendored                                                                                                                               |
| --------------- | --------------------------------------- | ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Instrument Sans | v4 (Fontsource, per api.fontsource.org) | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/instrumentsans | `assets/brand/fonts/instrument-sans-500.woff2`, `assets/brand/fonts/instrument-sans-700.woff2`, license text at `assets/brand/fonts/OFL.txt` |

Instrument Sans is used as a free OFL-licensed stand-in for Halyard (the
reference brand typeface, not freely licensable). See
`src/brand/brand.md` for the selection rationale. Only weights 500 and 700
were vendored — the upstream family does not publish 800/900 weights
(confirmed via the Fontsource API: available weights are 400/500/600/700).

Font files and license text fetched from the jsDelivr Fontsource CDN
(`cdn.jsdelivr.net/fontsource/fonts/instrument-sans@latest/...`) and the
`google/fonts` GitHub repository, respectively.
