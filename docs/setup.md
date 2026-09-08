# Project Setup: Vercel Project and Backing Services

This document records the exact commands used to link this repository to a
Vercel project and provision its backing services (Postgres via Neon, file
storage via Vercel Blob, and an OpenRouter API key), so the project can be
re-provisioned from scratch if needed.

Prerequisites: Vercel CLI installed (`pnpm dlx vercel@latest` or a global
install) and authenticated (`vercel login` — skip if already authenticated;
check with `vercel whoami`).

## 1. Discover the right provider via the Marketplace skill (agents) / docs (humans)

Before choosing a database or storage provider, consult Vercel's storage
guidance rather than assuming a provider. For Postgres, **Neon** is Vercel's
preferred marketplace integration (serverless Postgres, native env var
injection as `DATABASE_URL`). For file storage, **Vercel Blob** is a
first-party product (not a marketplace partner), provisioned directly via
`vercel blob`.

## 2. Link the project

The working directory name may contain characters that are invalid in a
Vercel project name (spaces, `&`, etc.), so pass an explicit project name
matching `package.json`'s `name` field:

```bash
vercel link --yes --project ai-data-analyst
```

This creates (or links to) a project named `ai-data-analyst` under your
current team/scope and writes `.vercel/project.json` (git-ignored).

## 3. Provision Postgres (Neon)

```bash
vercel integration add neon
```

**Manual step required (cannot be automated non-interactively):** the first
time any team installs the Neon marketplace integration, Vercel requires a
human to accept Neon's marketplace terms in a browser. Running the command
above in a non-interactive/agent context returns:

```json
{
  "status": "action_required",
  "reason": "integration_terms_acceptance_required",
  "verification_uri": "https://vercel.com/<team>/~/integrations/accept-terms/neon?source=cli"
}
```

To complete this as a human, either:

- Open the `verification_uri` printed above in a browser and accept the
  terms, then re-run `vercel integration add neon`; or
- Run `vercel integration accept-terms neon` in a real interactive terminal
  (not CI/agent mode) and confirm the prompt, then run
  `vercel integration add neon`.

Once installed and connected to the project, this provisions a Neon Postgres
database and injects `DATABASE_URL` into the project's environment variables
for Development, Preview, and Production.

Verify with:

```bash
vercel integration list
```

## 4. Provision Blob storage

Vercel Blob is a native product and does not require marketplace terms
acceptance. Create a store and link it to the linked project in one step:

```bash
vercel blob create-store ai-data-analyst-blob --access private --yes
```

This creates the store, connects it to the currently-linked project, and
injects `BLOB_READ_WRITE_TOKEN` into the project's environment variables.

## 5. Provision an OpenRouter API key

This project deliberately does **not** use Vercel AI Gateway: the Gateway
refuses every request with `403 customer_verification_required` until a credit
card is on file for the team, even to spend its free allotment. OpenRouter's
free models need no card and no credits.

1. Create an account at <https://openrouter.ai> (no payment method required).
2. Create a key at <https://openrouter.ai/settings/keys>.
3. Leave the key's credit limit at 0 — free models cost nothing, and a 0 limit
   makes it impossible for the app to spend money by accident.

Then add it to the project's environment variables:

```bash
vercel env add OPENROUTER_API_KEY production --value "<key-value>" --yes
vercel env add OPENROUTER_API_KEY preview --value "<key-value>" --yes
vercel env add OPENROUTER_API_KEY development --value "<key-value>" --yes
```

For local development you can instead append `OPENROUTER_API_KEY=<key>` to
`.env.local` directly. Note that `vercel env pull` **overwrites** `.env.local`,
so prefer adding it to the Vercel project as above.

### Free-tier limits

Free models are rate limited: roughly 20 requests per minute, and a daily cap
that is much lower for accounts that have never bought credits than for those
that have. The app treats a 429 as a normal condition — `lib/ai/errors.ts` maps
it to a message telling the user how long to wait, rather than failing opaquely.
The configured model is `openrouter/free` (see `lib/ai/model.ts`), OpenRouter's
free router, which spreads load across whichever free models are currently
available and support the request's tool-calling and structured-output needs.

## 6. Pull environment variables locally

```bash
vercel env pull .env.local --yes
```

This writes `.env.local` (git-ignored) with all environment variables
configured for the `development` environment: `DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN` and `VERCEL_OIDC_TOKEN` (plus `OPENROUTER_API_KEY`
once it is added to the project).

## 7. Verify every required variable is present

`lib/env.ts`'s `getEnv()` requires exactly three variables:
`OPENROUTER_API_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`.

Because this project uses `"type": "module"` in `package.json`, a plain
`node -e "require('dotenv')..."` one-liner fails (`require` is not defined
in ESM). Install `dotenv` as a dev dependency and use an ESM-compatible
check instead:

```bash
pnpm add -D dotenv
node --input-type=module -e "
import { config } from 'dotenv';
config({ path: '.env.local' });
['OPENROUTER_API_KEY','DATABASE_URL','BLOB_READ_WRITE_TOKEN'].forEach(k=>{
  if(!process.env[k]){ console.log(k, 'MISSING'); } else { console.log(k, 'ok'); }
});
"
```

Expected: three `ok` lines. (Equivalently, `pnpm dlx dotenv-cli -e .env.local -- node -e "..."` works too, but requires network access to fetch `dotenv-cli` on first use.)

## Environment variables reference

| Variable | Purpose | Provisioned by |
|---|---|---|
| `OPENROUTER_API_KEY` | API key for OpenRouter — authenticates model calls routed through `https://openrouter.ai/api/v1`. Used only server-side. Free models require no credits. | Created by hand at <https://openrouter.ai/settings/keys>, then `vercel env add` |
| `DATABASE_URL` | Postgres connection string for the Neon serverless database, used by `@neondatabase/serverless` / Drizzle ORM for all relational data. | `vercel integration add neon` (manual step: accept Neon marketplace terms in a browser, see Step 3) |
| `BLOB_READ_WRITE_TOKEN` | Read/write token for the project's Vercel Blob store, used by `@vercel/blob` for uploaded file storage. | `vercel blob create-store` |
| `VERCEL_OIDC_TOKEN` | Auto-provisioned short-lived (~24h) OIDC JWT used internally by Vercel tooling. Not required by `getEnv()`; refresh by re-running `vercel env pull`. | `vercel link` / `vercel env pull` (automatic) |

## Re-provisioning from scratch

1. `vercel link --yes --project ai-data-analyst`
2. `vercel integration add neon` (accept marketplace terms in a browser first if prompted — see Step 3)
3. `vercel blob create-store ai-data-analyst-blob --access private --yes`
4. Create an OpenRouter key at <https://openrouter.ai/settings/keys>, then `vercel env add OPENROUTER_API_KEY <production|preview|development> --value "<key>" --yes` for each environment
5. `vercel env pull .env.local --yes`
6. `pnpm add -D dotenv` (if not already installed) and run the verification snippet in Step 7 above

## Known manual/human-only steps

- **Neon marketplace terms acceptance** (Step 3) cannot be completed by a
  non-interactive agent or CI process. A human must accept the terms once
  per team, either via the browser `verification_uri` or by running
  `vercel integration accept-terms neon` in a real interactive terminal.
  Until this is done, `DATABASE_URL` will not be provisioned.
