# Jarida Design System — React Native Reference

All design tokens are in `constants/`. Import from individual files or the barrel `constants/theme.ts`.

## Colors

### Brand
| Token | Value | Usage |
|-------|-------|-------|
| `Brand.purple` | `#8C4BFF` | Brand mark only (see Accent below for CTAs/active states) |
| `Brand.charcoal` | `#1C1C1C` | Primary text, headings |
| `Brand.white` | `#FFFFFF` | Backgrounds, text on brand |

### Accent
| Token | Value | Usage |
|-------|-------|-------|
| `Accent.base` | `#7C3AED` | CTAs, active states, links, borders — matches `@jarida/ink`'s `ACCENTS.Purple[0]` |
| `Accent.pressed` | `#6D28D9` | Pressed/active interaction state |
| `Accent.soft` | `rgba(124, 58, 237, 0.11)` | Selected background tint |
| `Accent.softer` | `rgba(124, 58, 237, 0.06)` | Quietest "this one" mark |
| `AccentPurple` | `#7C3AED` | Flat alias for `Accent.base` |

### Purple Scale (brand mark ramp — not the interactive accent)
```
50:  #F4ECFF    Soft brand-tinted backgrounds
100: #E6D6FF    Light borders
200: #CFB0FF    Focus rings
300: #B386FF    Decorative
400: #9D63FF    Secondary active
500: #8C4BFF    Brand mark ★ (see Accent for interactive color)
600: #7636E6    Deep brand tint
700: #5D23C2    Deep accent
800: #421593    Dark surfaces
900: #2A0C66    Darkest
```

### Neutrals (Grey)
```
50:  #FAFAFA    Screen backgrounds
100: #F5F5F5    Card backgrounds (secondary)
200: #EDEDED    Borders, dividers
300: #D9D9D9    Strong borders
400: #B5B5B5    Disabled, inactive icons
500: #8A8A8A    Tertiary text, tab inactive
600: #5F5F5F    Secondary text
700: #3D3D3D    Code text, strong labels
800: #262626    Dark surfaces
900: #1C1C1C    Charcoal (= Brand.charcoal)
```

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `Semantic.success` | `#1F8A3C` | Online, connected, positive |
| `Semantic.warning` | `#C88A00` | Memory warnings, caution |
| `Semantic.danger` | `#C8383B` | Errors, destructive actions |
| `Semantic.info` | `#1C63D1` | Informational, ASR |

Each has a `Soft` variant for backgrounds (e.g., `Semantic.successSoft`).

## Typography

### Font Families
| Token | Value | Usage |
|-------|-------|-------|
| `FontFamily.display` | `Quicksand` | Hero text, large headings |
| `FontFamily.heading` | `Quicksand` | Section titles |
| `FontFamily.body` | `Quicksand` | Body text, labels, buttons |
| `FontFamily.bodyAlt` | `Comfortaa` | Alternative body (warm) |
| `FontFamily.mono` | `JetBrainsMono-Regular` | Code, model names, cron |

### Font Sizes
```
xs:   10    Badges, labels, metadata
sm:   12    Captions, secondary text
base: 14    Body text, button labels
md:   16    Section titles, card headings
lg:   18    Screen titles
xl:   20    Hero text
2xl:  24    Large display
```

### Font Weights
```
regular:  400
medium:   500
semibold: 600
bold:     700
```

## Spacing (8pt grid, 4px half-step)
```
xs:   4     Tight gaps
sm:   8     Default gap
md:   12    Comfortable padding
lg:   16    Section padding
xl:   20    Large spacing
2xl:  24    Section margins
3xl:  32    Screen-level padding
4xl:  40
5xl:  48
6xl:  64
7xl:  80    GOTG-specific, beyond @jarida/ink's scale
8xl:  96    GOTG-specific, beyond @jarida/ink's scale
```

## Border Radii
```
xs:   4     Focus rings
sm:   6     Small buttons, inputs
md:   10    Cards, modals, main elements
lg:   14    Large cards
xl:   20    Rounded panels
2xl:  28    Hero elements
pill: 999   Chips, badges
```

## Shadows
```
xs:   Subtle lift (elevation 1)
sm:   Card default (elevation 2)
md:   Elevated card (elevation 4)
lg:   Modal/overlay (elevation 8)
brand: Accent glow (accent-colored shadow)
```

## Token Audit vs. `@jarida/ink` (issue #20)

Recorded ahead of the `@jarida/ink` adoption work (#17) so the two known
discrepancies are a deliberate call, not something that just drifts.

### Brand mark vs. UI accent

Ink deliberately splits the **brand mark** (`PURPLE.500 = #8C4BFF`, 4.42:1 on
its light background — reserved for the ink-plate/edge ramp) from the **live
UI accent** it actually uses on interactive elements
(`ACCENTS.Purple[0] = #7C3AED`, 5.47:1). The gap exists because the mark's
contrast margin is too thin to safely carry a text label; the accent's isn't.

GOTG's `JaridaPurple` ramp is value-for-value identical to ink's `PURPLE`
ramp. GOTG previously used `JaridaPurple[500]` (#8C4BFF) as `tint` — i.e. as
the live interactive accent (buttons, `borderBrand`, `tabIconSelected`) —
which was exactly the conflation ink split apart.

**Decision: align with ink.** Interactive elements now use the new `Accent`
token (`Accent.base = #7C3AED`, matching `ACCENTS.Purple[0]`) instead of
`JaridaPurple[500]`. `JaridaPurple`/`Brand.purple` (`#8C4BFF`) remain defined
as the brand mark ramp, matching ink's own mark/accent split, but are no
longer used for CTAs, borders, active tab icons, or `textBrand` — those all
route through `Accent` now (see `constants/colors.ts`). This was swept across
the app: every `JaridaPurple[500]`/hardcoded `#8C4BFF` interactive usage was
repointed to `AccentPurple`/`Accent.base`. Not yet touched: the other
`JaridaPurple` ramp steps (50/200/400/600/700, used for hover/soft/border
variants) still use brand-purple-derived shades rather than accent-derived
ones — a full remap of those crosses into the actual `@jarida/ink` component
adoption (#17) and is scoped there, not here.

### Spacing scale shape

No real incompatibility: GOTG's `Spacing` values (4, 8, 12, 16, 20, 24, 32,
40, 48, 64) are numerically identical to `@jarida/ink`'s `SPACE` scale for
every step ink defines — this app's spacing was never a pure 4pt grid, it
already has ink's 8pt-with-4px-half-step shape. The `constants/spacing.ts`
doc comment calling it a "4pt grid" was inaccurate and is corrected above.
GOTG additionally defines two larger steps (`7xl: 80`, `8xl: 96`) that ink
doesn't have named equivalents for — these don't conflict with ink's scale
and can be kept as GOTG-specific extensions past ink's ceiling.

**Decision: no change needed.** The scales are compatible as-is.

## Role Colors
Used for model role assignment chips:
```
chat:  #7C3AED  (accent purple)
think: #F5A524  (amber)
task:  #17C964  (green)
asr:   #0072F5  (blue)
tts:   #F31260  (red)
```
