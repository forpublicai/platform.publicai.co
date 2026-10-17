# Staging environment proposal (draft — for review by Sean)

**Status:** Proposal, not implemented. This document does not change any
deployment configuration, branch protections, or Zuplo project settings.
It is a starting point for infra review.

## Goal

Give engineers a safe environment to validate gateway changes (routing,
policies, LiteLLM integration, billing/wallet flows) against a
non-production LiteLLM backend before they reach `main`/production.

## Proposed setup

Zuplo deploys automatically from git via its native git integration, so the
simplest staging setup reuses that instead of a separate CI/CD pipeline:

1. **Create a long-lived `staging` branch** off `main`.
2. **In the Zuplo portal**, add a second environment (e.g. "Staging")
   configured to deploy from the `staging` branch, with its own
   environment variables (`LAGO_API_BASE`, `LAGO_API_KEY`, `AUTH0_DOMAIN`,
   `AUTH0_CLIENT_ID`/`SECRET`, LiteLLM base URL, etc.) pointed at
   staging/sandbox instances of Lago, Auth0, and LiteLLM — never
   production credentials.
3. **Staging LiteLLM**: stand up (or reuse an existing) LiteLLM instance
   seeded with test model routes and a low-cost/free test API budget, and
   point the staging environment's LiteLLM-related config
   (`set-litellm-headers.ts` env vars) at it.
4. **Zuplo preview URLs**: Zuplo can also generate preview deployments per
   pull request; those are useful for reviewing route/policy changes in
   isolation, while the `staging` branch environment is the longer-lived
   environment for integration testing against staging LiteLLM/Lago/Auth0.

This proposal does not change the existing `main` → production deployment
behavior; it only adds a parallel branch/environment.

## Promotion steps (staging → production)

1. Open a PR into `staging` from a feature branch; confirm the Zuplo
   preview deployment builds and the smoke-test checklist below passes
   against staging dependencies.
2. Merge to `staging`; verify the staging Zuplo environment redeploys
   and rerun the smoke-test checklist against the staging environment
   URL.
3. Open a PR from `staging` into `main` (or cherry-pick the verified
   commits) once staging checks are green.
4. Merge to `main`; Zuplo deploys to production per existing git
   integration behavior (unchanged).
5. Rerun a subset of the smoke tests against production immediately
   after deploy.

## Smoke-test checklist

Run against the environment's base URL (staging or production) with a
test account/API key:

- [ ] `GET /` (developer portal) returns 200
- [ ] Auth: log in / obtain a session token succeeds against the
      environment's Auth0 tenant
- [ ] `POST` to the API key creation endpoint issues a key for a test
      consumer (verifies `modules/api-keys.ts` + Zuplo key bucket config)
- [ ] A chat/completions request through the gateway to the environment's
      LiteLLM backend returns a successful response
- [ ] Wallet balance endpoint returns a balance for a test customer
      (`modules/wallet-balance-handler.ts`)
- [ ] A test top-up call succeeds and the new balance reflects the
      top-up amount (`modules/wallet-topup.ts` against staging Lago)
- [ ] Rate limiting kicks in as expected for a test consumer exceeding
      its plan's per-minute limit (`modules/user-rate-limiter.ts`)
- [ ] No unexpected 5xx responses in Zuplo logs for the above during the
      smoke test window

## Open questions for Sean

- Should staging point at a fully separate Auth0 tenant, or a
  staging-only set of test users in the existing tenant?
- Is there an existing staging LiteLLM deployment to reuse, or does one
  need to be provisioned?
- Should staging Lago billing data be periodically reset?
