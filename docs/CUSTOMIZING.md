# Customizing the Portal

The template is designed so **normal branding and service changes do not require editing portal components**.

## The rule

Use `portal.config.ts` for deployment/studio configuration.

Use the database/admin screens for client/project data.

If changing a client's name, project phase, next action or agreed total requires editing a React component, the data is in the wrong layer.

## Branding

`portal.config.ts -> brand`

Configure:

- `name`
- `shortName`
- `logo`
- `logoAlt`
- `supportEmail`
- `website`

If `logo` is null the shell generates a typographic monogram from the studio name.

Place logo assets in `public/` and reference them with a root-relative path such as `/logo.svg`.

## Theme

`portal.config.ts -> theme`

The shipped base theme is premium and restrained: warm ground, deep ink/navy and gold accent.

The theme becomes CSS custom properties at the portal/admin shell, so section styles consume tokens rather than hardcoded client colors.

After changing theme values run:

```bash
npm test
```

The config validator checks required foreground/background contrast pairs. Do not bypass a failing contrast test by removing the pair; choose an accessible token.

## Feature flags

`portal.config.ts -> features`

Available switches include project, files, approvals, messages, invoices, time log, care plan, handoff, decisions and help.

A disabled client module should disappear from:

- navigation
- walkthrough
- client queries
- section routes/UI

The underlying schema can remain in place so enabling it later is a config change rather than another database migration.

Do not use feature flags as authorization. Security remains RLS/server-side.

## Project phases

`portal.config.ts -> phases`

Each phase has:

- stable `key`
- display ordinal
- label
- short explanation

The key is stored in project data. Once real projects exist, treat keys as stable identifiers. You may safely change labels/blurb without migrating project rows.

If your studio uses different vocabulary — e.g. Strategy / Creative / Build / QA / Launch — configure it here before onboarding clients.

## File categories

`portal.config.ts -> fileCategories`

These drive the upload category selector and display labels.

Keep keys stable once files have been categorized. Changing a label is harmless; changing a key makes existing rows fall back to an unknown/Other label unless migrated.

## Handoff checklist

`portal.config.ts -> handoffChecklist`

Definitions are copied into `handoff_items` when a new project is created.

Examples:

- domain
- hosting
- code/repository
- analytics
- CMS/admin
- email/forms
- owner guide
- walkthrough video

Changing the config affects future projects; it does not silently rewrite the checklist on existing projects. That is intentional because a project's handoff history is project data.

Handoff notes must remain non-secret.

## Help and walkthrough copy

`portal.config.ts -> content`

Configure:

- welcome title/body
- walkthrough introduction
- process explanation
- FAQs
- custom links

The walkthrough's individual structural steps live in `lib/portal/tour.ts` because they map to actual product modules. If you materially change the walkthrough, increment `TOUR_VERSION` so people who completed an older version are offered the new one.

A cosmetic wording tweak does not necessarily require a version bump.

## Per-client project content

Use `/admin`, not config, for:

- client/business identity
- project name
- project summary/scope
- phase/status
- current focus
- next action and due date
- milestone
- agreed total
- requested files
- approvals
- decisions
- invoice state
- handoff state

This is what lets one deployment serve many clients.

## Demo portal

`PORTAL_DEMO_MODE=true` makes the loader use `lib/demo/dataset.ts` instead of real project data.

Demo content is intentionally isolated there. Components render the same `PortalView` shape and therefore do not need a parallel demo UI.

Mutation controls in demo mode should remain inert/disabled.

Never copy a real client's data into the demo dataset.

## Adding a new reusable module

Do not start by adding a card to Overview.

A proper module usually needs:

1. feature flag/config shape
2. database schema
3. RLS and grants
4. SQL isolation test coverage
5. `PortalView` types
6. loader query
7. client page/component
8. mutation API if needed
9. admin/operator control if needed
10. attention/nav/walkthrough integration if actionable
11. documentation

The product should remain simple. Reject modules that turn the portal into a general-purpose project-management platform without materially improving the client experience.

## Design direction

Keep the client workspace calmer than the marketing site:

- generous spacing
- restrained accents
- strong hierarchy
- quiet motion
- clear statuses
- obvious next action

Avoid turning rebranding into an unrestricted page builder. A disciplined token/config system keeps every deployment polished and maintainable.

## Accessibility

Customization must preserve:

- visible keyboard focus
- approximately 44px interactive targets
- semantic headings and controls
- text contrast
- reduced-motion behavior
- non-color status cues

Run the config tests after theme changes and manually keyboard-test any new interactive component.