# Formula Builder — Design & Implementation

## Overview

The Formula Builder is the most advanced sort mode in the Sorting tab. Users write math formulas that score posts, using available post fields and functions. The formula compiles to an `L2Expr` JSON tree that the evaluator runs against every post.

## Architecture

```
User interaction (blocks/text)
  → formula text string (e.g., "log(likes + 1) * 10 + reposts * 2")
  → formula-parser.ts (parseFormula)
  → L2Expr tree (JSON)
  → l2-eval/src/expr.ts (evalExpr)
  → numeric score per post
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/formula-parser.ts` | Text → L2Expr parser + L2Expr → text decompiler |
| `apps/web/src/lib/sort-formula.ts` | SortFormula config type + compiler (used by old builder, may be deprecated) |
| `apps/web/src/components/l2/SortFormulaBuilder.tsx` | Main Formula Builder component (text editor + blocks + reference panels) |
| `apps/web/src/components/l2/FormulaBlocks.tsx` | Visual block representation (drag, select, operators, conditions, grouping) |
| `apps/web/src/components/l2/ConditionEditor.tsx` | Recursive condition editor UI (if/else/else-if with live description) |
| `packages/core-types/src/l2.ts` | L2Expr type definition (all node types) |
| `packages/l2-eval/src/expr.ts` | L2Expr evaluator (runs formulas against posts) |

## Formula Syntax

### Fields (user-friendly aliases → actual L2NumericField)
```
likes → like_count
reposts → repost_count
replies → reply_count
quotes → quote_count
bookmarks → bookmark_count
followers → author_follower_count
follows → author_follows_count
posts → author_posts_count
text_len → text_length
images → image_count
video_size → video_size_bytes
hashtags → facet_tag_count
links → facet_link_count
mentions → facet_mention_count
editor_score → editor_score
age_hours → post_age_hours
```

### Operators
`+`, `-`, `*`, `/`, `**` (power)

### Functions
- `log(x)` — natural log (returns 0 for non-positive)
- `sqrt(x)` — square root (returns 0 for negative)
- `abs(x)` — absolute value
- `floor(x)`, `ceil(x)` — round down/up
- `min(a, b)`, `max(a, b)` — minimum/maximum
- `pow(a, b)` — power (same as `a ** b`)
- `clamp(x, lo, hi)` — constrain between lo and hi
- `if(condition, then, else)` — conditional (condition uses >, >=, <, <=, ==, !=)

### Examples
```
likes + reposts * 2 + replies
log(likes + 1) * 10 + log(reposts + 1) * 15
(likes + reposts) / (followers + 1) * 100
pow(likes + 1, 0.7) * 10
clamp(likes * 2 + reposts * 3, 0, 1000)
likes + reposts * 2 + if(video_size > 0, 50, 0)
if(followers < 500, likes * 3, likes)
```

## UI Components

### 1. Text Editor (top)
- Monospace textarea with syntax validation
- Real-time error display with position
- Secondary to blocks — power users can type directly
- Syncs bidirectionally with blocks

### 2. Visual Blocks
- Each top-level additive/subtractive term is a block
- Block anatomy: `[±sign] [icon] [formula text] [operator toggle] [drag handle] [remove]`
- **Click** to select, **shift+click** or **multi-select mode** for multiple
- **Drag** to reorder
- **Click text** to edit inline
- **± button** (left): toggles negation (wraps in `-(...)`)
- **Operator button** (right, not on last block): cycles `+ → - → * → /` — determines how this block connects to the NEXT block
- **Multi-select toolbar**:
  - `☐ Multi-select` toggle — click to enter multi-select mode
  - `⚡ if()` — opens condition editor for selected blocks
  - `( )` — groups selected blocks into parentheses (merges into one block)
  - Selection count badge

### 3. Condition Editor (opens from ⚡ if() button)
- **Recursive** — can nest else-if chains
- **Parts:**
  - Condition row: field dropdown, operator dropdown, value input
  - Else options (radio):
    - Value: number input
    - Field: field dropdown + operator dropdown (raw/+/-/×/÷) + amount
    - Else if: opens nested condition editor (indented with left border)
- **Live description** — human-readable sentence updating as you change settings
- **Re-editing** — clicking if() on a block that already has a condition parses it back into the editor
- Produces: `if(field op value, <selected blocks>, <else expr>)`

### 4. Fields Panel
- Click-to-insert as new block (after selected, or at end)
- Auto-adds `+` operator between new block and previous

### 5. Functions Panel  
- Click to wrap selected block(s) in the function
- Functions: log, sqrt, abs, floor, ceil, min, max, clamp, pow

### 6. Numbers Panel
- Common values: 0, 0.5, 1, 2, 3, 10, 50, 100
- Click to insert as new block

### 7. Templates
- Full formula presets — click to replace entire formula
- 10 templates: Engagement, Log engagement, Engagement rate, Sqrt fairness, Power curve, Capped engagement, Video boost, Time decay, Discussion finder, Small account boost

### 8. Compiled Expression
- Read-only JSON textarea showing the L2Expr tree
- Copy JSON button

## Block Splitting Logic

Formulas are split into blocks at top-level `+` and `-` operators (not inside parentheses/functions). Each block is a self-contained term:

```
"log(likes + 1) * 10 + reposts * 5 + if(video > 0, 50, 0)"
         ↓                    ↓              ↓
   Block 1            Block 2         Block 3
```

Parenthesized expressions like `(likes + reposts)` stay as one block even though they contain `+` internally.

## TODO / Future Refinements

- [ ] Live preview — show real posts from pool scored by current formula, updating as you edit
- [ ] Better inline editing UX (currently click to edit shows a raw text input)
- [ ] Undo/redo support
- [ ] The operator toggle on blocks could show a dropdown instead of cycling
- [ ] Ability to edit the `+` that auto-inserts when clicking fields (currently always `+`)
- [ ] Drag blocks between different positions in nested expressions (currently only top-level reorder)
- [ ] Better handling of complex blocks — blocks that contain multiple operators could show a mini-breakdown
- [ ] Keyboard shortcuts (e.g., Delete to remove selected block)
- [ ] Formula validation against actual pool data (warn if a field will always be 0)
- [ ] Save formula as sort pack (one-click publish to marketplace)
