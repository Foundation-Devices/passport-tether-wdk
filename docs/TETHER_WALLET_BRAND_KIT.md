# Tether Wallet visual brand kit

Source of truth: [wallet.tether.io](https://wallet.tether.io/) inspected on 23 July 2026.

This kit is for the Passport Prime Tether WDK proof of concept. It translates the live
Tether Wallet aesthetic to two constrained product surfaces: Android and Passport
Prime's 480 × 800 display. It does not change wallet, signing, pairing, storage, or
QuantumLink behavior.

## Brand character

- Monochrome, cinematic, and intentionally quiet.
- Near-black canvases with warm-white typography.
- Digital-token artwork provides the only persistent colour.
- Controls are outlined or softly raised rather than brightly filled.
- Large, tightly spaced headlines are paired with restrained supporting copy.
- Information density stays low; hierarchy comes from scale, spacing, and contrast.

## Core colour tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#030303` | Root screen background |
| Surface | `#0C0C0C` | Navigation/footer and large elevated regions |
| Card | `#1A1A1A` | Cards, fields, icon wells |
| Raised | `#202122` | Active tabs and higher-elevation controls |
| Primary text | `#F2F1EF` | Headlines, values, primary icons |
| Secondary text | `rgba(242,241,239,0.70)` | Body copy and labels |
| Tertiary text | `rgba(242,241,239,0.40)` | Hints, timestamps, inactive states |
| Hairline | `rgba(242,241,239,0.15)` | Borders and separators |
| Focus hairline | `rgba(242,241,239,0.50)` | Selected and security-critical outlines |
| Error | `#E53935` | Destructive and failure states only |

Tether green is not used as a general UI accent in the current Tether Wallet product.
It remains present only inside official token artwork where appropriate.

## Typography

- Product UI and section headings: **Schibsted Grotesk**, 600–700.
- Display/brand moments: **Sharp Grotesk**, 500–700.
- Long supporting copy: **Roboto**, 400.
- Numeric wallet values use the UI face with tabular alignment where available.
- Blockchain addresses and hashes remain monospaced.
- Display tracking is tight (`-3%` on the website); small labels use `0.5–1.2px`
  positive tracking.

Prime uses the platform's embedded sans face, so the same character is recreated with
weight, scale, line height, and tracking rather than shipping another renderer font.

## Shape, border, and spacing

- Radius scale: `8`, `12`, `20`, and full-pill `50`.
- Standard cards: 1px warm-white hairline at 15% opacity.
- Primary actions: transparent black with a warm-white 1px outline.
- Selected tabs and compact controls: `#202122` or 8% warm-white.
- Screen gutters: 24px Android; 22px Prime.
- Primary touch targets: 52–60px high.
- Icon wells: 38–44px, usually 12–14px radius.

## Logo and imagery

- Use the official warm-white `tether.wallet` wordmark without tinting.
- The official black app icon may be used for splash and launcher artwork.
- Do not recreate the wordmark in a system font.
- Token marks retain their native colours; surrounding UI remains monochrome.
- Avoid gradients except extremely subtle black-on-black depth treatments.

Reference assets captured from the live site are stored in
`docs/brand-kit/assets/`. Runtime-ready derivatives live beside each app's normal
asset files.

## Surface translation

### Android

- Preserve the Tether Wallet's near-black, edge-to-edge composition.
- Use the official Sharp Grotesk OpenType files from the site for runtime UI text;
  Metro does not package the site's WOFF2 Schibsted build.
- Balance and portfolio content should feel like the product's sparse home view,
  not a coloured banking dashboard.
- Use outline actions, low-contrast pills, and compact dark transaction rows.
- The Passport connection is a secondary hardware-security status, not the main
  brand identity.

### Passport Prime

- Keep the official wordmark centered in a quiet 72px header.
- Use black canvases, warm-white typography, hairline cards, and white outlined
  actions.
- Tether Wallet remains the product brand; Passport and QuantumLink appear as the
  security mechanism.
- Maintain larger physical-device type sizes and fixed-height layouts to prevent
  clipping on the 480 × 800 display.

## Do not

- Reintroduce the previous orange accent palette.
- Fill whole portfolio cards with brand or network colours.
- Use green dots as decorative elements.
- Add visual changes that alter navigation, authorization, pairing, or wallet state.
- Shrink instructional copy below the existing accessibility-conscious Prime sizes.
