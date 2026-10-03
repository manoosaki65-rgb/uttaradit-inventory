# Inventory Final — Cloudflare structure

Scope: existing Pages project `uttaradit-inventory`, existing D1 `uttaradit-inventory-db` / binding `DB`, existing Git branch `inventory-final`. Master work is deferred and excluded from this deployment. No D1 schema changes or production data writes were made.

## Verification

- `npm run build`, `npx tsc --noEmit`, `node scripts/test-final.mjs` pass.
- The actual Pages handler runs against isolated in-memory SQLite with the same existing schema. Only three daily fixture rows and one temporary manually added row are used. No Master file or 4,107-row fixture is used.
- Adding, editing, cancellation without removing a record, duplicate-number rejection, all 14 filters, search, pagination, XLS/XLSX/PDF daily import, repeat import, and dates read from data are tested.
- Owner-only deletion verifies the signature, issuer, audience, expiry and email of a Cloudflare Access JWT. Spoofed email headers, unauthenticated users and another account are rejected. Archive and deletion roll back together on failure. Positive deletion is tested only in the isolated local database.
- Daily preview and received/keyed historical ranges pass. Missing fund year continues to prevent printing, as in Final. The print JSX and CSS match the recovered original source.
- Browser tests on the isolated preview confirm adding a row, editing it, cancellation confirmation, filtering, daily preview and historical preview. A date input event issue found during browser testing was fixed; the 10–11 September preview shows three rows, 13 original columns, total 9,000.00 and original signatures.
- D1 reads confirm 75 current records, 227 records in `inventory_backup_before_master_4107`, and 16 existing import batches. Backup is preserved; recovery/import is outside this round's scope.

## Login limitation

The Pages project has no authentication environment variables, and this account has not enabled Cloudflare Zero Trust. The original AppDeploy login cannot be used for Cloudflare without a configured replacement. No fake owner identity is returned and deletion fails closed. Enable an owner-only Cloudflare Access application for `/api/admin/*`, then set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` on this Pages project to make the login flow usable. Permission remains restricted to `manoosaki65@gmail.com`; no new owner is granted access. Until configured, positive owner login/deletion on production cannot be claimed as tested.

Production checks after push must be read-only: page load, health check, current list, search/filter and report-range reads. Do not submit changes to real D1 data while verifying deployment.
