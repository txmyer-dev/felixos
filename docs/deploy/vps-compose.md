# FelixOS VPS Docker Compose Runbook

This runbook provides exact steps for a first-time deployment of FelixOS on a VPS using Docker Compose.

## Prerequisites
- A Linux VPS with Docker and Docker Compose Plugin installed.
- (Optional) Node.js (v24) and pnpm if you plan to run seeding/CLI tools directly on the host rather than inside a container.

## 1. Clone the Repository
Clone the repository to your VPS:
```bash
git clone https://github.com/txmyer-dev/felixos.git
cd felixos
```

## 2. Generate Secrets Safely
You need securely generated random strings for your environment variables. Run the following on a secure machine to generate them:
```bash
openssl rand -hex 32 # Use for TOTP_SECRET_ENCRYPTION_KEY and SESSION_SECRET
openssl rand -hex 16 # Use for database passwords
```

## 3. Fill out `.env`
Copy the example environment file:
```bash
cp .env.example .env
```
Edit `.env` and fill in all variables:
- `POSTGRES_PASSWORD`: The PostgreSQL superuser password. (Secret)
- `APP_DB_USER` / `APP_DB_PASS`: Credentials for the web app. (Secret)
- `PRIV_DB_USER` / `PRIV_DB_PASS`: Credentials for the privileged (migration) role. (Secret)
- `DATABASE_URL`: Must match `postgresql://${APP_DB_USER}:${APP_DB_PASS}@postgres:5432/felixos`.
- `DATABASE_PRIVILEGED_URL`: Must match `postgresql://${PRIV_DB_USER}:${PRIV_DB_PASS}@postgres:5432/felixos`.
- `NEXT_PUBLIC_APP_URL`: Your public HTTPS domain (e.g., `https://felixos.example.com`).
- `TOTP_SECRET_ENCRYPTION_KEY`: A 64-character hex string for encrypting TOTP secrets. **DO NOT LOSE THIS** (Secret).
- `SESSION_SECRET`: A secure random string for session signing. (Secret)
- `LLM_BASE_URL` / `N8N_API_KEY`: N8n integrations. (Secret)

## 4. Build and Start the Compose Stack
Start the stack. This will build the Docker images and start the services.
```bash
docker compose up -d --build
```
> **Note on Migrations**: The `migrate` container runs a one-shot process to provision users and apply schema changes, then exits. The API and Web containers will wait for PostgreSQL to become healthy, but they don't race for migrations.

## 5. Seeding / Provisioning
You can either seed a demo tenant (for testing) or provision a real operator tenant using the CLI.

**To seed a demo tenant:**
```bash
pnpm db:seed
```
*Note: Make sure `HOST_DB_PORT` is exposed if running this command from the host.*

**To provision an operator tenant:**
Run the CLI tool from within the API container or locally if `DATABASE_PRIVILEGED_URL` is properly routed:
```bash
docker compose exec api pnpm cli provision --slug "my-msp" --name "My MSP"
```

> **IMPORTANT**: Be sure to safely capture the **TOTP secret** and **recovery codes** outputted by the provision command. If you lose them, you will be locked out of the tenant.

## 6. Reverse Proxy Configuration
Expose only the `web` container to the internet (port 3000 mapped to host port 3005 by default). The API container should remain private.

Use Cloudflare Tunnels, Dokploy, or Caddy to point your domain to the web container (e.g., `http://127.0.0.1:3005`).
See [Edge Security](./edge-security.md) for rate-limiting and HTTPS settings.

## 7. Verification
Verify the stack is running by checking the API health check:
```bash
curl http://127.0.0.1:3006/health
# Expected: {"status":"ok","timestamp":"..."}
```

Verify the public web interface:
```bash
curl -I https://felixos.example.com/login
# Expected: HTTP/2 200 OK
```

## 8. Routine Updates
To update FelixOS to the latest version:
```bash
git pull origin main
docker compose up -d --build
```
The `migrate` container will automatically run any new database migrations before the API starts serving traffic.

## 9. Rollback Basics
To rollback to a previous version:
```bash
git checkout <previous-commit-sha>
docker compose up -d --build
```
*Note: Database migrations are generally not automatically rolled back. If a breaking schema change was introduced, you may need to restore from a backup.*

For backup instructions, see [Backup & Restore](./backup-restore.md).
