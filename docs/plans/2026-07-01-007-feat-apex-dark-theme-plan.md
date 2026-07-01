---
title: Apex Dark Theme Re-skin - Plan
type: feat
date: 2026-07-01
topic: apex-dark-theme
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Apex Dark Theme Re-skin - Plan

## Goal Capsule

- **Objective:** Re-theme `apps/web` with the dark color palette extracted from aiwithapex.com while preserving the existing quiet, dense operational layout. Dark-only. Tracked as GitHub issue #77.
- **Product authority:** Tony Myers. All product decisions (palette source, restraint rules, dark-only, re-theme-not-redesign) were confirmed interactively and are locked in issue #77 — do not re-open them.
- **Stop conditions:** Any change to layout, navigation structure, fonts, or component APIs is out of scope — stop and ask. No gradients, no glow shadows.
- **Open blockers:** None.

---

## Product Contract

### Summary

Swap the light sage-green token set in `apps/web/app/styles.css` for the Apex dark palette and polish the shared components so every state reads correctly on dark. The app already routes all color through semantic CSS variables mapped into Tailwind via `@theme`, so the work is a token swap plus a targeted component pass — not a redesign.

### Problem Frame

The current theme is a placeholder light palette. The desired brand aesthetic is the dark violet/teal system used by aiwithapex.com. A grep confirms no hardcoded colors exist outside `apps/web/app/styles.css`, so the token file is the single choke point.

### Requirements

- R1. All web surfaces (command-center, accounts list, account drill-in, triage, n8n, knowledge, login) render with the Apex dark palette: bg `#070512`, surface `#141029`, raised surface `#1c1740`, border `#2a2350`, heading text `#f4f2ff`, body text `#c7c2e0`, muted `#8b85ae`, primary violet `#7c4dff`, teal accent `#22c7c7`.
- R2. Layout, spacing, navigation, and typography are unchanged — no gradients, glows, or font swaps; the dense operational UI style from AGENTS.md Frontend Expectations is preserved.
- R3. Dark-only: no light variant, no theme toggle, no `prefers-color-scheme` branching.
- R4. Status semantics are legible on dark: success `#34d399`, warning `#fbbf24`, danger `#fb7185`. Violet is the primary-action color; teal is reserved for small accents (focus rings, status dots), never large fills.
- R5. Native form controls, scrollbars, and autofill render dark (`color-scheme: dark`), and inputs/textareas have explicit dark backgrounds — no white browser-default wells.
- R6. Text-on-surface pairs pass a WCAG AA contrast spot-check (body text ≥ 4.5:1, large/bold ≥ 3:1).

### Scope Boundaries

**Deferred to Follow-Up Work**
- Light mode / theme toggle.
- Apex display typography (Clash Display / Satoshi) and gradient/glow motifs.
- Any layout or navigation redesign.

---

## Planning Contract

### Key Technical Decisions

- **KTD1 — Token swap at the existing choke point.** Keep the `:root` CSS variables → `@theme` mapping architecture in `apps/web/app/styles.css` untouched; only values change, plus new tokens. New semantic tokens: `--accent` (`#22c7c7`), `--success` (`#34d399`), `--warning` (`#fbbf24`), `--abyss` (`#0c0820`, for input wells / recessed areas). Mapping of existing tokens: `--background` `#070512`, `--foreground` `#f4f2ff`, `--surface` `#141029`, `--surface-muted` `#1c1740`, `--border` `#2a2350`, `--border-strong` `#3d3564` (derived one step lighter than border — Apex ships only one border color), `--muted` `#8b85ae`, `--muted-foreground` `#c7c2e0`, `--primary` `#7c4dff`, `--primary-foreground` stays `#ffffff` (explicit decision — white on `#7c4dff` ≈ 4.8:1, clears AA with little margin; it's reused by the primary button, active nav, and active tab, so it's in the U3 spot-check), `--danger` `#fb7185`.
- **KTD2 — Hover direction flips on dark.** `hover:brightness-95` (darken) on the primary/danger buttons reads as "disabled" on a dark theme; hovers should lighten (`brightness-110`) or step to a lighter fill.
- **KTD3 — On-danger foreground is dark.** `#fb7185` is a light rose; white text on it fails contrast. The danger button uses a near-black foreground (`--background`) instead of `--primary-foreground`.
- **KTD4 — Badge tones map to real status tokens.** The current `success` tone borrows `--primary` and `warning` borrows neutral grays. With R4's status colors available, tones map success→`--success`, warning→`--warning`, danger→`--danger`, all as translucent fills (`/10` bg, `/30` border) with the solid color as text.
- **KTD5 — Focus visibility uses the teal accent, offset from the element.** A global `:focus-visible` ring in `--accent` satisfies the "teal for small accents" rule and improves keyboard visibility on dark, where the browser default ring is hard to see. The ring is drawn as an outline with a 2px offset so it sits over the page background rather than the focused element's own fill — `#22c7c7` has only ~2.3:1 contrast against the violet primary fill and ~1.3:1 against the rose danger fill, so an offset-free ring would blend into exactly the elements keyboard users focus most (primary button, active nav, active tab, danger button).

### Sources

- Palette extracted from aiwithapex.com compiled CSS (`/_astro/Footer.CMgLh7jl.css` `--color-*` tokens), 2026-07-01.
- Token architecture: `apps/web/app/styles.css`; consumers verified token-only by grep (no hex/palette classes in `app/`, `components/`, `lib/`).
- Shell conventions: `docs/solutions/architecture-patterns/phase5-surfaces-shell.md` (reuse `components/ui/*` primitives; keep UI dense and scannable).

---

## Implementation Units

### U1. Swap the token set and global styles to the Apex dark palette

**Goal:** `apps/web/app/styles.css` carries the full dark palette and dark-mode fundamentals.

**Requirements:** R1, R3, R5

**Dependencies:** None.

**Files:** `apps/web/app/styles.css`

**Approach:** Replace `:root` variable values per KTD1; add `--accent`, `--success`, `--warning`, `--abyss` and their `@theme` `--color-*` mappings; add `color-scheme: dark` on `:root`; give `input`/`textarea` explicit `background: var(--abyss)` and `color: var(--foreground)`; add the global `:focus-visible` accent ring with `outline-offset: 2px` (KTD5). The login screen's styles live in this file and inherit the swap.

**Test expectation:** none — pure styling; verified in U3's browser pass.

**Verification:** `pnpm dev`, load `/login`: page is dark, inputs are dark wells (no white boxes), tab-focus shows a teal ring.

### U2. Polish shared components for dark

**Goal:** Every `components/ui/*` state reads correctly on the dark palette.

**Requirements:** R2, R4, R6

**Dependencies:** U1.

**Files:** `apps/web/components/ui/button.tsx`, `apps/web/components/ui/badge.tsx`, `apps/web/components/ui/tabs.tsx`, `apps/web/components/ui/table.tsx`, `apps/web/components/ui/empty-state.tsx`

**Approach:** Button — flip hover brightness per KTD2; danger variant gets dark foreground per KTD3. Badge — remap tones per KTD4. Tabs, table, empty-state — audit only; they consume semantic tokens and should need no change unless the browser pass shows a contrast problem.

**Test expectation:** none — class-string changes with no behavioral logic; existing component render behavior is unchanged.

**Verification:** All button variants (primary/secondary/ghost/danger) and all badge tones visibly distinct and legible on `#141029`.

### U3. Screen-level dark pass and verification

**Goal:** All seven routes verified on dark; contrast spot-checked; suite green.

**Requirements:** R1, R2, R6

**Dependencies:** U1, U2.

**Files:** `apps/web/components/shell/sidebar.tsx`, `apps/web/components/command-center/pending-item.tsx`, `apps/web/components/drill-in/section.tsx`, `apps/web/app/(app)/**` (audit; edit only where a screen composes colors poorly on dark)

**Approach:** Walk `/login`, `/` (command-center), `/accounts`, `/accounts/[id]`, `/triage`, `/n8n`, `/knowledge` in the browser. Fix screen-local issues (e.g., pending-item textarea well, sidebar active/hover states). Spot-check contrast for the main text/surface pairs (R6) — `#c7c2e0` on `#141029` and `#8b85ae` on `#070512` both clear 4.5:1, and `#ffffff` on `#7c4dff` (primary button, active nav, active tab) ≈ 4.8:1; confirm the offset focus ring reads clearly on violet and rose fills (KTD5); verify anything derived during implementation.

**Test expectation:** none new — no behavioral change; existing Playwright specs must stay green since this touches route-level chrome.

**Verification:** Browser pass of all seven routes; existing Playwright e2e suite passes (the `unauthenticated` project runs without the API stack; run the authenticated shell specs if the seeded stack is available).

---

## Verification Contract

- `pnpm turbo run lint typecheck test build` — the standard per-issue gate, green.
- `pnpm format:check` — green.
- Existing Playwright e2e passes (route-level chrome touched → e2e is mandatory per AGENTS.md; at minimum the `unauthenticated` project, plus authenticated shell specs when the seeded stack is available).
- Manual browser pass of all seven routes on `:3000` with screenshots for the PR (UI-visible change).
- Contrast spot-check recorded in the PR body for the pairs in R6.

## Definition of Done

- All R1–R6 satisfied; U1–U3 landed.
- No gradients, glows, font changes, or layout changes in the diff.
- Verification Contract green; PR includes screenshots and `Closes #77`.
- No dead code or abandoned experiments left in the diff.
