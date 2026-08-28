/**
 * Built-in style recipes — the interim inspiration library (roadmap 12b).
 *
 * Distilled from real gallery exemplars during the inspo-recipe experiment;
 * each is a complete, executable style direction an agent adapts to its brief.
 * This static library is the v0 backend for get_style_recipe; the Phase 5
 * inspiration tools (search_inspiration over a curated corpus) replace the
 * plumbing without changing the workflow.
 */

export interface StyleRecipe {
  /** slug agents pass to get_style_recipe */
  name: string
  title: string
  /** the design category the recipe was distilled for */
  category: string
  /** shown in the guide's recipe menu — enough to decide whether to fetch */
  oneLiner: string
  markdown: string
}

export const STYLE_RECIPES: StyleRecipe[] = [
  {
    name: 'crav-loud-appetite',
    title: 'CRAV — loud appetite',
    category: 'food & drink, consumer brands with attitude',
    oneLiner: 'Loud retro food branding: chunky display type, burgundy–mustard–lettuce palette, appetite over polish',
    markdown: `# CRAV — loud appetite

North star: a hand-painted diner sign, not a startup. The page should feel hungry —
saturated food colors, type with real weight, zero corporate restraint.

## Palette (derive tints from these, no outsiders)
- Ground: deep burgundy #5C1A1B — walls of the diner
- Accent: mustard #E3A72F — the squeeze bottle; CTAs and highlights
- Support: lettuce green #7BA05B — freshness cues, badges, small accents
- Paper: warm cream #F6EEDD — text panels, cards
- Ink: near-black espresso #241512 — body text on cream

## Type
- Display: Modak (Google Fonts) — huge, single words or short phrases only; it
  collapses at paragraph scale.
- Alt display / subheads: Mouse Memoirs — condensed, friendly shout.
- Body: a plain grotesque (Archivo) at normal weight; the display faces do ALL the
  personality work.
- Scale contrast is the move: hero display 6–8× body size.

## Moves
- Full-bleed color blocks per section; alternate burgundy / cream / mustard grounds.
- Product photography or food illustration big and cropped, never floating in white.
- Sticker/badge shapes (rotated pills, starbursts drawn as CSS/SVG) for prices and
  claims — ASCII/entities only, no emoji, no decorative glyphs that risk tofu.
- Buttons: fat, pill or slab, ink outline + hard offset shadow; hover shifts the fill.

## Fits / avoid
Fits: restaurants, snacks, beverages, bold DTC food brands. Avoid: anything that
needs to read premium-quiet or enterprise-trustworthy.`,
  },
  {
    name: 'oatside-soft-shelf',
    title: 'Oatside — soft shelf',
    category: 'food & drink, friendly consumer packaged goods',
    oneLiner: 'Cream-grounded CPG warmth: rounded serif display, milky palette, illustration-led charm',
    markdown: `# Oatside — soft shelf

North star: the friendliest carton on the supermarket shelf. Everything soft:
rounded type, milky colors, generous air, small jokes in the microcopy.

## Palette
- Ground: oat cream #F3E9D7 — the whole page sits on it; white only inside cards
- Ink: roasted brown #3B2B20 — headings and body, never pure black
- Accent: caramel #C6803B — CTAs, links, highlights
- Support: milk-coffee tan #D9BE9C and a muted sky #A8C3CE for variety blocks

## Type
- Display: Fraunces (Google Fonts), SOFT optical sizing, medium-to-black weights —
  rounded, slightly retro serif presence.
- Body: a warm humanist sans (Nunito Sans) — round terminals keep the tone.
- Sentence case everywhere; headlines conversational ("Made for mornings"), not
  feature-speak.

## Moves
- Sections separated by background tone shifts within the cream family, not rules.
- Chunky rounded corners (16–24px) on cards, images, buttons — one radius, applied
  everywhere.
- Product/mascot illustration beats photography; if photographic, warm-toned and
  prop-styled, never stocky office scenes.
- Small delight details: wavy SVG section dividers, a rotating badge, underline
  squiggles on key words.

## Fits / avoid
Fits: CPG, cafés, breakfast/snack brands, anything cozy-consumer. Avoid: data-heavy
SaaS, security, finance — the softness reads unserious there.`,
  },
  {
    name: 'datacurve-warm-paper',
    title: 'Datacurve — warm paper',
    category: 'SaaS and developer tools',
    oneLiner: 'Warm-paper SaaS: quiet grotesk system, disciplined neutrals, ONE hot pink accent doing all the talking',
    markdown: `# Datacurve — warm paper

North star: a crisp technical document printed on good paper, with one fluorescent
highlighter stroke. Precision from restraint; energy from a single loud accent.

## Palette
- Ground: warm paper #F7F4EE — not white, not gray; the warmth is the point
- Ink: soft black #16130F
- Accent: hot pink #FF24BD — used SPARINGLY: primary CTA, one highlighted word,
  active states. If it appears more than a handful of times, the recipe is broken.
- Support: paper-shadow #E7E1D5 for borders/wells; muted olive #6B6A4F for
  secondary labels

## Type
- Display + body: one grotesk family, Schibsted Grotesk (Google Fonts) — weight and
  size do the hierarchy, not face changes.
- Eyebrow labels: 11–12px, uppercase, generous letter-spacing, muted olive.
- Numbers/metrics may drop into a mono (Spline Sans Mono) for instrument feel.

## Moves
- Hairline borders (1px, paper-shadow) outline cards and split sections — layout
  reads as a printed grid.
- Real product UI screenshots framed in thin borders on paper, slight offset shadow;
  no glassy mockup floats.
- Diagrams as flat line-art SVG in ink + accent, not decorative 3D blobs.
- Density is welcome: tight tables, small caps labels, footnote-style meta text.

## Fits / avoid
Fits: dev tools, data/API products, technical B2B. Avoid: lifestyle/consumer where
the restraint reads cold.`,
  },
  {
    name: 'ponder-editorial-hairline',
    title: 'Ponder — editorial hairline',
    category: 'SaaS, research and knowledge products',
    oneLiner: 'Editorial-minimal SaaS: mono eyebrows, hairline rules, serif headlines, magazine calm',
    markdown: `# Ponder — editorial hairline

North star: a well-set journal article about software, not a software ad. The page
persuades by reading beautifully — structure from typography and hairlines alone.

## Palette
- Ground: gallery off-white #FAF8F4
- Ink: charcoal #1F1D1A
- Accent: oxide red #B4432E — links, key numbers, one underline per viewport
- Support: hairline gray #DCD7CE; stone #8A8377 for meta text

## Type
- Display: a text serif with presence (Newsreader or Source Serif 4, Google Fonts),
  regular weight, LARGE — elegance from size, not boldness.
- Eyebrows/meta: Fragment Mono, 11–12px uppercase, wide tracking — the signature
  move; every section opens with a mono eyebrow over the serif headline.
- Body: the serif at reading size, 1.6–1.7 line-height, measure ~65ch.

## Moves
- Hairline rules (1px) structure everything: under the nav, between sections,
  around figures — never boxes with fills, never shadows.
- Two-column asymmetric layouts: narrow mono-labeled rail + wide reading column.
- Figures captioned like a publication (mono caption under a hairline).
- Motionless confidence: no gradients, no cards, at most a background tone shift
  for one featured section.

## Fits / avoid
Fits: research tools, note-taking, AI/knowledge products, studios, essays-as-landing.
Avoid: playful consumer or promo-heavy pages that need loud CTAs.`,
  },
  {
    name: 'feather-dusk-glow',
    title: 'Feather — dusk glow',
    category: 'SaaS, finance and premium consumer software',
    oneLiner: 'Dark premium SaaS: near-black dusk ground, one luminous gradient glow, thin light type, product-as-hero',
    markdown: `# Feather — dusk glow

North star: the product screen glowing alone in a dark room. Premium through
darkness and restraint — one light source, everything else recedes.

## Palette
- Ground: dusk #0C0E12 — blue-black, never pure #000
- Ink: moonlight #E8EAF0 for headings; slate #9BA3B5 for body
- Glow: ONE luminous accent — aurora teal #57E6C2 — appearing as (a) a soft radial
  gradient bloom behind the hero product shot and (b) tiny sharp touches (link
  hover, live-dot, one metric). Nowhere else.
- Support: raised-surface #151922 for cards; hairline #232936 for borders

## Type
- Display: a refined sans at LIGHT weight, large and tightly tracked
  (Instrument Sans or Inter Tight, 300–400) — thin type on dark is the luxury cue.
- Body: same family, small and quiet; slate color keeps hierarchy without bolding.
- Mono (JetBrains Mono) for tickers, figures, timestamps.

## Moves
- The product UI is the hero: large, sharp screenshot or recreated UI panel, edge-lit
  by the glow gradient; everything else supports it.
- Raised surfaces separate from the ground by tone (#151922) + 1px hairline, not
  shadows.
- Section rhythm: vast dark breathing room, then a tight dense feature cluster.
- Charts/sparklines drawn as thin luminous lines (SVG) — data as light.

## Fits / avoid
Fits: fintech, analytics, pro/prosumer tools, anything selling calm mastery. Avoid:
warm/friendly consumer brands and content-heavy reading pages (dark long-form tires).`,
  },
]

export function getStyleRecipe(name: string): StyleRecipe | undefined {
  return STYLE_RECIPES.find((r) => r.name === name.trim().toLowerCase())
}

/** The menu embedded in the agent guide and resident prompt: enough to decide
 *  which recipe (if any) to retrieve for the brief. */
export const STYLE_RECIPE_MENU = STYLE_RECIPES.map((r) => `- ${r.name} (${r.category}) — ${r.oneLiner}`).join('\n')
