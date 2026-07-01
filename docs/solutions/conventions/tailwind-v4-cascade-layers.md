---
module: apps/web
tags:
  - tailwind
  - css
  - dark-theme
  - playwright
problem_type: convention
---

# Tailwind v4 Cascade Layers

Tailwind v4 emits utilities inside `@layer utilities`. Unlayered author CSS wins over every layered rule regardless of selector specificity, so a global unlayered selector like `button { background: var(--primary); color: var(--primary-foreground); }` can silently override component utilities such as `bg-danger`, `bg-transparent`, or `text-muted-foreground`.

In `apps/web/app/styles.css`, keep broad element defaults inside `@layer base`. Reserve unlayered CSS for deliberate always-win rules only, and explain the exception inline. The current `:focus-visible` ring is intentionally unlayered so utility classes do not casually remove the accessibility outline.

When touching the dark theme or shared component variants, run the Playwright theme guard:

```bash
pnpm --filter @felixos/web test:e2e -- --project unauthenticated --grep "dark theme component variants"
```

The guard loads real compiled CSS, injects representative Button, Badge, and Tabs variant markup, then checks computed colors and WCAG AA text contrast. This catches the cascade failure mode before it reaches authenticated shell routes.
