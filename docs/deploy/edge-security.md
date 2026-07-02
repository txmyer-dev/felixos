# Edge Security Configuration

FelixOS delegates certain security controls—such as rate limiting and SSL termination—to the edge (the reverse proxy or CDN in front of the application). This ensures that brute-force traffic never reaches the application logic.

## Security Checklist
Before exposing your FelixOS deployment to the public internet, verify the following:

- [ ] **HTTPS Only**: The public FelixOS domain must be served exclusively over HTTPS.
- [ ] **API Port Privacy**: The API container (default port `3006`) must **not** be exposed to the public internet. Only the web container (default port `3005`) should be routed via the reverse proxy.
- [ ] **Rate Limiting**: A rate limit of **20 requests per minute** must be enforced on all login paths (`/login`, `/api/auth/login`).
- [ ] **Secure Cookies**: In production, session cookies will automatically set the `Secure`, `HttpOnly`, and `SameSite=Lax` flags. You must access the app via HTTPS for these cookies to be accepted by the browser.
- [ ] **HSTS (Optional but Recommended)**: Enable HTTP Strict Transport Security if your domain is dedicated to FelixOS.
- [ ] **Log Hygiene**: Operator environments must secure deployment logs. The TOTP secrets and recovery codes are only printed during manual CLI provisioning (not in normal app logs), so ensure your SSH terminal is cleared and CLI output is not persisted to uncontrolled logging systems.

## Implementing Rate Limits
You must configure your edge provider to enforce the login rate limit.

### Cloudflare
If you are using Cloudflare WAF:
1. Go to **Security > WAF > Rate limiting rules**.
2. Create a rule matching the path `*felixos.example.com/login*` and `*felixos.example.com/api/auth/login*`.
3. Set the limit to **20 requests** per **1 minute**.
4. Set the action to **Block**.

### Caddy / Dokploy / Traefik
If you are using a self-hosted reverse proxy, consult its documentation for rate limiting. For example, in Caddy, you can use the `rate_limit` plugin (if built with it) to restrict POST requests to `/api/auth/login`.

## Verifying Edge Security

**Check HTTPS and Cookies:**
Log in to your instance using a web browser and inspect the Network tab or Application tab:
1. Verify the site is loaded over `https://`.
2. Inspect the `felixos_session` cookie. It should have the `Secure` and `HttpOnly` checkboxes checked.

Alternatively, use `curl`:
```bash
curl -I https://felixos.example.com/login
# Check for HTTP/2 200 OK and no unencrypted HTTP redirects.
```

**Check API Privacy:**
Attempt to reach the API directly from an external network (using the VPS's public IP and port 3006 or 4000). The connection should be refused or time out.
```bash
curl http://<vps-public-ip>:3006/health
# Expected: Connection refused or Timeout
```
