# FelixOS Backup, Restore, and Rollback

Operational data, TOTP secrets, recovery-code hashes, and integration data are stored in the Postgres database. This document details how to back up and restore your FelixOS deployment.

## What to Back Up

You must back up **two** separate components. A database backup is useless if you lose the encryption keys.

1. **The Database**: The `postgres_data` Docker volume.
2. **The Environment Secrets**: The `.env` file on the VPS.

> [!CAUTION]
> If you lose the `TOTP_SECRET_ENCRYPTION_KEY` from your `.env` file, all encrypted TOTP secrets and n8n API keys in the database will become unrecoverable. Users will be permanently locked out. **Always back up `.env` off-host securely.**

## Creating a Backup

Use `pg_dump` to create a logical backup of the `felixos` database from the running compose stack.

```bash
# Run this on the VPS to dump the database to a file
docker compose exec -T postgres pg_dump -U felixos_privileged felixos > felixos_backup_$(date +%F).sql
```

Securely copy `felixos_backup_*.sql` and `.env` off the VPS to a secure storage location (e.g., AWS S3, local encrypted drive).

## Restoring from a Backup

To restore a backup into a fresh environment:

1. **Prepare the Stack**: Ensure your `.env` file is exactly the same as it was when the backup was taken.
2. **Start Postgres and Migrate**:
   ```bash
   # Start the database and migration runner
   docker compose up -d postgres migrate
   ```
3. **Wait for Migrations**: Wait for the `migrate` container to exit. This ensures the roles (`felixos_app_role`, `felixos_privileged_role`) and schemas are provisioned.
4. **Restore the Data**:
   ```bash
   # Pipe the backup file into the postgres container
   cat felixos_backup.sql | docker compose exec -T postgres psql -U felixos_privileged felixos
   ```
5. **Start the Rest of the Stack**:
   ```bash
   docker compose up -d
   ```

### Verification

Run the following after a restore to ensure everything works:

```bash
curl http://127.0.0.1:3006/health
```

Then navigate to your public domain and log in to verify TOTP validation succeeds (which proves the encryption key matches).

## Application Rollbacks

If an app update introduces a bug but no destructive database migrations were applied:

```bash
# Checkout the previous working version
git checkout <previous-tag-or-sha>
# Rebuild and restart the containers
docker compose up -d --build
```

If a destructive database migration was applied and you must roll back both the code and the database, you must **restore the database from the pre-upgrade backup** using the restore steps above after checking out the older code.
