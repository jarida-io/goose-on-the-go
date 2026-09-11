# Jarida Design System — React Native Reference

All design tokens are in `constants/`. Import from individual files or the barrel `constants/theme.ts`.

## Colors

### Brand
| Token | Value | Usage |
|-------|-------|-------|
| `Brand.purple` | `#8C4BFF` | Primary brand, CTAs, active states |
| `Brand.charcoal` | `#1C1C1C` | Primary text, headings |
| `Brand.white` | `#FFFFFF` | Backgrounds, text on brand |

### Purple Scale
```
50:  #F4ECFF    Soft backgrounds, hover states
100: #E6D6FF    Light borders
200: #CFB0FF    Focus rings
300: #B386FF    Decorative
400: #9D63FF    Secondary active
500: #8C4BFF    Brand primary ★
600: #7636E6    Brand hover, text accent
700: #5D23C2    Deep accent, active text
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
brand: Purple glow (purple shadow)
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
ramp, but GOTG uses `JaridaPurple[500]` (#8C4BFF) as `tint` — i.e. as the
live interactive accent (buttons, `borderBrand`, `tabIconSelected`) — which
is exactly the conflation ink split apart. (GOTG already avoids the sharpest
edge of this today by using the darker `JaridaPurple[600]` for `textBrand`
rather than 500.)

**Decision: diverge, deliberately.** Keep `#8C4BFF` as GOTG's single
interactive accent for now rather than adopting ink's `#7C3AED` split.
Reasoning: `#8C4BFF` is GOTG/GIAP's brand identity color across the app icon,
splash screen, and marketing, not just in-app chrome — swapping the running
accent to `#7C3AED` ahead of the actual ink adoption (#17) would be a
cosmetic change with no functional benefit yet. Revisit this when #17 lands
and the app moves onto ink's token set wholesale; at that point, re-evaluate
whether `#8C4BFF`-as-accent should become a documented, permanent divergence
from ink's default semantics or be dropped in favor of `#7C3AED`.

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
chat:  #8C4BFF  (purple)
think: #F5A524  (amber)
task:  #17C964  (green)
asr:   #0072F5  (blue)
tts:   #F31260  (red)
```
