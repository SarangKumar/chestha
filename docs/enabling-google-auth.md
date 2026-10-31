# Enabling Google sign-in

Sign-in today is email and password only, restricted to `@gmail.com`. Google
OAuth is planned, and the groundwork is in place: **no database change is
needed.** `packages/db/test/oauth-ready.test.js` locks that promise, so if
someone trims an "unused" column the test fails rather than the first real
Google sign-in.

## Why no migration is needed

`schema.prisma` already carries what `@auth/prisma-adapter` writes:

- **`Account`** — the provider link, with `@@unique([provider, providerAccountId])`
  so a replayed callback cannot create a second row for the same Google user,
  and `onDelete: Cascade` so no orphan can be re-matched later.
- **`User.passwordHash` is nullable** — a Google user has no password, and
  `verifyCredentials` treats "no password set" as failed credentials rather
  than as an error that would reveal the account exists.
- **`User.handleChosen`** — no provider supplies a username, but `handle` is
  required and unique. `chesthaAdapter` in `apps/website/auth.js` wraps the
  adapter's `createUser` to assign a provisional handle so the insert can
  succeed, and this flag is what routes that user to `/onboarding/username`
  before they get a usable session.
- **`Session` / `VerificationToken`** — unused (credentials sign-in uses a JWT,
  which is the only strategy NextAuth supports for credentials), but present so
  a provider using database sessions needs no migration either.

## The three steps

1. Add the provider in `apps/website/auth.js`, beside the commented block that
   is already there:

   ```js
   import Google from 'next-auth/providers/google';
   // ...
   providers: [
     Credentials({ /* unchanged */ }),
     Google({
       clientId: process.env.AUTH_GOOGLE_ID,
       clientSecret: process.env.AUTH_GOOGLE_SECRET,
     }),
   ]
   ```

2. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` — already documented in
   `apps/website/.env.example`. In Google Cloud Console the redirect URI is
   `<origin>/api/auth/callback/google`, for every origin including previews.

3. Add a "Continue with Google" button to `/signin` and `/signup`. It calls
   `signIn('google')`, so it needs no server action of its own.

Nothing else. The adapter writes the `Account` row.

## Four things to decide before switching it on

These are judgement calls, not blockers, and none of them is a schema change.

- **Do not put an OAuth sign-in through `validateSignupEmail`.** That is the
  gmail-only rule, and a Google **Workspace** user's address is their own
  company domain. Running Workspace identities through a gmail-only check
  rejects exactly the users Google sign-in is meant to admit. Signing in
  through Google is already proof Google owns the address, which is what the
  domain rule is a proxy for. The function's own comment says this; keep it
  that way.

- **Decide what happens when the email already has a password account.**
  NextAuth refuses this by default with `OAuthAccountNotLinked`, rather than
  trusting the provider's email and handing over an existing account. That
  default is the safe one and the error is currently routed to `/signin`, where
  it will read as a generic failure. Either write a specific message for it, or
  deliberately allow linking — and if you allow it, require the user to be
  signed in already, because trusting a provider's `email` alone is an account
  takeover.

- **Gmail ignores dots and `+suffixes`.** `a.b@gmail.com`, `ab@gmail.com` and
  `ab+x@gmail.com` are one inbox, but three distinct rows under the current
  `email @unique`. So one person can hold several password accounts today, and
  when Google sign-in arrives it reports one canonical address and will link to
  only one of them. If that matters, canonicalise gmail addresses before the
  uniqueness check — it needs no schema change, but it does change what counts
  as a duplicate, so do it before there are many accounts rather than after.

- **`emailVerified` stays null for password accounts**, by product decision —
  there is no verification step. Google sets it. Do not let anything come to
  treat it as "this account is real".

## Checking it

`npm test` covers the schema contract and the domain rule. The flow itself
needs a human with a `DATABASE_URL` and real Google credentials:

| # | Do | Expect |
| --- | --- | --- |
| A1 | Sign in with Google on a fresh address | Lands on `/onboarding/username`; an `accounts` row exists with `provider: "google"` |
| A2 | Pick a username, then reload | `handleChosen` is true; later sign-ins skip onboarding |
| A3 | Sign in with Google using a **Workspace** address | Works. If it is refused, a gmail-only check has leaked into the OAuth path |
| A4 | Sign in with Google using an email that already has a password account | Whatever you decided above — and a message that says it, not a generic failure |
| A5 | Sign up with a password at a non-gmail address | Still refused, with "Use a @gmail.com address to sign up." |
| A6 | Sign **in** with a password at a non-gmail address that already exists | Works. The domain rule must never apply to sign-in |
