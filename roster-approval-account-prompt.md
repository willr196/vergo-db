# Prompt: Auto-Create User Account on Roster Applicant Approval

## Context

When someone applies to join the VERGO roster via `apply.html`, they become an `Applicant` record with an associated `Application`. Admins review these in `admin.html` and can update the status to `HIRED`. Currently, setting status to `HIRED` just updates the `Application.status` field — it doesn't create a `User` account, so the approved person can't log in to the platform to see or apply for VERGO shifts.

The `User` model already has an `applicantId` field (optional, unique) that links back to `Applicant`, but nothing populates it automatically.

The goal: when an admin sets an application status to `HIRED`, automatically create a `User` account for that applicant with a temporary password, send them a welcome email with their login credentials, and require them to change their password on first login.

## What to do

### 1. Add `mustChangePassword` to the User model

In `apps/api/prisma/schema.prisma`, add to the `User` model:

```
mustChangePassword  Boolean   @default(false)
```

Run `npx prisma migrate dev --name add-must-change-password` from `apps/api`.

### 2. Update the status update route in `apps/api/src/routes/applications.ts`

The `PATCH /:id/status` handler currently just updates the status. When the new status is `HIRED`, add logic after the status update to:

1. **Look up the Applicant** — the `Application` has `applicantId`; fetch the `Applicant` record to get their `firstName`, `lastName`, `email`, `phone`
2. **Check if a User already exists** for that email — if they already have an account, just link it by setting `applicantId` on the User (if not already linked), and skip account creation. Don't send the temp password email in this case.
3. **If no User exists**, create one:
   - Generate a temporary password: 12 characters, alphanumeric, using `crypto.randomBytes(9).toString('base64url').slice(0, 12)` — simple, readable, no ambiguous characters
   - Hash it with bcrypt (cost 12, matching the existing pattern in `userAuth.ts`)
   - Create the `User` record with: `email`, `passwordHash`, `firstName`, `lastName`, `phone`, `emailVerified: true` (admin has verified them by approving), `applicantId` linking to the `Applicant`, `mustChangePassword: true`
   - Handle the unique constraint on `email` gracefully — if the create fails because email already exists, log a warning and continue (don't crash the approval)
4. **Send the welcome email** with the temp password (only if a new account was created — see step 3 below)

Wrap the entire account creation block in try/catch — log errors but don't fail the status update. The approval should succeed even if the account creation hits an edge case.

Import `bcrypt` and `crypto` at the top of `applications.ts` (check if they're already imported).

### 3. Add the welcome email function in `apps/api/src/services/email.ts`

Add a new exported function `sendRosterApprovalEmail` following the existing template pattern (gold VERGO header, white cards on `#f9f9f9`). It should:

- Send to the applicant's email address (not TO_EMAIL — this goes to the applicant, not the admin)
- From: `FROM_EMAIL` (`noreply@vergoltd.com`)
- Subject: `🎉 Welcome to the VERGO Roster!`
- Tag: `{ name: 'category', value: 'roster-approval' }`
- Body should include:
  - A warm welcome message ("You've been approved to join the VERGO roster")
  - Their login credentials in a clearly styled box: email address and temporary password
  - A prominent "Log In" button linking to the web login page (use `${env.webOrigin}/user-login.html`)
  - A clear instruction that they must change their password on first login
  - Mention that they can now browse and apply for available VERGO shifts
- Import `env` from `../env` if not already imported (it's used in other email functions for `env.webOrigin`)

Call this function from the status update handler in `applications.ts` after successfully creating the User account. Wrap in try/catch — don't fail the approval if email fails.

### 4. Enforce password change on login

In `apps/api/src/routes/userAuth.ts`, in both the web login (`POST /login`) and mobile login (`POST /mobile/login`) handlers:

After successful password verification and email verification checks, but before creating the session/returning tokens, add a check:

```typescript
if (user.mustChangePassword) {
  return res.status(403).json({
    ok: false,
    error: "You must change your password before continuing.",
    code: "MUST_CHANGE_PASSWORD"
  });
}
```

This means the frontend (web and mobile) will need to handle this response code and redirect to a password change flow. Don't build that frontend flow in this prompt — just add the backend gate. The `code: "MUST_CHANGE_PASSWORD"` gives the frontend a reliable way to detect this case.

Also add a new route `POST /change-password` (and `POST /mobile/change-password`) that:

- Accepts `{ email, currentPassword, newPassword }` — validated with Zod
- Verifies the current password matches
- Hashes the new password with bcrypt (cost 12)
- Updates `passwordHash` and sets `mustChangePassword: false`
- For web: creates a session and logs them in
- For mobile: returns tokens (same as login response)
- Rate limit: reuse `loginLimiter`

Add `mustChangePassword` to the user select query in the login handlers so it's available for the check. It's a Boolean so it's a trivial addition to the existing select object.

### 5. Verification

After all changes:

- `grep -n "mustChangePassword" apps/api/prisma/schema.prisma` — should show it on the User model
- `grep -n "mustChangePassword" apps/api/src/routes/userAuth.ts` — should show the login gate check
- `grep -n "MUST_CHANGE_PASSWORD" apps/api/src/routes/userAuth.ts` — should show the error code
- `grep -n "sendRosterApprovalEmail" apps/api/src/services/email.ts` — should show the new function
- `grep -n "sendRosterApprovalEmail" apps/api/src/routes/applications.ts` — should show it imported and called
- `grep -n "change-password" apps/api/src/routes/userAuth.ts` — should show the new route
- `grep -n "HIRED" apps/api/src/routes/applications.ts` — should show the account creation logic
- `npx tsc --noEmit` from `apps/api` to check for TypeScript errors

Do NOT modify any frontend files (`admin.html`, `user-login.html`, etc). The frontend handling of `MUST_CHANGE_PASSWORD` will be a separate prompt.
