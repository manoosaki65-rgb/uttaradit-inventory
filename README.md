# Uttaradit Inventory -> Cloudflare migration

Prepared from the existing AppDeploy application `inventory-mwjjut` on 2026-09-29.

## Safety rules
- Do not delete, reset, or overwrite the existing AppDeploy app during migration.
- Existing embedded Master is 3,857 rows; current-work data after the seed lives in AppDeploy DB and must be exported before cut-over.
- Do not switch the homepage link until row counts and samples match.
- Inventory `69-05492` must be removed from active data only after it has been copied into `inventory_deleted_archive`.

## Target
- Cloudflare Worker `uttaradit-inventory`
- D1 binding `DB`
- D1 database `uttaradit-inventory-db`

## Status
Repository created and migration scaffold committed. AppDeploy remains untouched as the backup/source of truth until migration verification is complete.
