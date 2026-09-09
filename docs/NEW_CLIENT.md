# New Client Checklist

This is the normal workflow **after the portal product has already been deployed for the studio**.

The goal is that client #10 is configuration/data entry, not another engineering project.

## 01 — Confirm the project is scoped

Have the agreed project name, scope summary and total before creating project invoices.

Do not create a fake placeholder amount just to make Stripe work. `projects.agreed_total` is the source used to derive the deposit/final invoices.

## 02 — Open `/admin`

Sign in with the configured admin/operator account and open the operator dashboard.

## 03 — Create the client + project

Use **New client portal** and enter:

- contact name
- contact email
- business name
- phone if useful
- project name
- scope summary
- agreed total

The provisioning route creates the client/project, seeds the configured handoff checklist, creates/links the portal user, creates the project membership and sends the first magic link.

## 04 — Verify the project dashboard

Open the project in `/admin/[projectId]` and set:

- phase
- project summary
- current focus
- next client action
- action due date when useful
- next milestone

Keep this copy plain-language. The portal exists to answer: **what is happening, what do I need to do, what happens next?**

## 05 — Request initial assets

Add requested files such as:

- logo files
- photos
- brand guide
- existing copy
- policies/legal text

Requested files appear above the general file library so the client can immediately see what is still needed.

## 06 — Send/re-send the invite

The first provisioning action sends the invite automatically. Use **Resend invite** from the project operator screen if needed.

Never manually create a password. Client authentication is magic-link based.

## 07 — Confirm client access

Use a separate test/browser session if appropriate and verify that the invited client:

- can sign in
- sees only the intended project
- sees the first-login walkthrough
- can skip it
- can replay it from Help
- can upload a file
- can send a message

Do not use an admin session as evidence that client RLS works.

## 08 — Run the project through the portal

As work progresses:

- update current focus and phase
- put concrete client tasks in next action
- request approvals instead of accepting informal “looks good” messages
- record decisions worth remembering
- request files through the Files module
- keep handoff notes operational and non-secret

## 09 — Invoice from the project

Use **Issue deposit** / **Issue final** from the operator screen.

The route accepts the project id and invoice kind only. The amount is derived from `projects.agreed_total` on the server.

If the agreed total is wrong, correct the project record before issuing an invoice. Do not work around the amount rule.

## 10 — Complete handoff

After final approval and final payment:

1. confirm `final_payment_cleared_at` was set by the Stripe webhook
2. move each handoff item through Ready → Transferred as the actual provider transfers complete
3. use provider-native account-transfer flows; do not paste passwords/API keys into notes
4. record ownership transfer only after the final payment has cleared

The database trigger blocks ownership transfer before final payment even if the UI or a future route has a bug.

## Adding another person to an existing project

Use the invite endpoint/operator flow with the existing `projectId`. The first project member is the owner; later members are collaborators. Access is through `project_members`, so adding a client's marketing manager does not require a schema change.

## What should require code changes?

Normally: nothing.

Code changes are appropriate for a genuinely new reusable module or product behavior. Client-specific wording, colors, project status and project content should not require component edits.