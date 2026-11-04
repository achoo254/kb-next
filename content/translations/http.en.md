---
source: lab/http
sourceHash: 561ac68600ba404ea76a484fd882079365e74b78af618388d0b513a3ba0039e2
---
# The HTTP protocol

Estimated time: 50 minutes. This lesson has an interactive playground: [Open the playground on Học Cloud](https://hoc-cloud.inetdev.io.vn/lab/http).

## Quick summary

- **HTTP Request = method + path + headers + body**
  - **Why:** [RFC 9110 §6](https://datatracker.ietf.org/doc/html/rfc9110#section-6) defines an HTTP request as a method, a request target (path), an HTTP version, headers, and an optional body. [RFC 9112 §3](https://datatracker.ietf.org/doc/html/rfc9112#section-3) specifies the wire format for HTTP/1.1: a request-line followed by header fields (CRLF-separated), a blank line, then the body. These 4 parts are everything the server needs to process the request — a missing important header (Content-Type, Authorization) → the server returns 400/401, which has nothing to do with the network.
  - **When it breaks:** Missing Content-Type in a POST JSON request → many frameworks (Express, FastAPI, Spring) refuse to parse the body or parse it wrongly → return 400/422. Missing Authorization → 401. Debug with curl -v to see exactly which bytes are sent.
  - **In production:** When writing a reverse proxy (nginx, Caddy) or an API gateway, you must forward the client's headers correctly (especially Host, X-Forwarded-For, Authorization). A missing proxy_set_header in the nginx config → the backend receives the wrong headers → auth fails or rate limiting is applied to the wrong IP.

- **HTTP Response = status line + headers + body**
  - **Why:** [RFC 9110 §15](https://datatracker.ietf.org/doc/html/rfc9110#section-15) fully defines the semantics of status codes: 1xx informational, 2xx success, 3xx redirection, 4xx client error, 5xx server error. The status code is the contract between server and client about the result of processing the request. When debugging an API: read the status first, then the error message in the body — a body error only makes sense once the status code has established the context.
  - **When it breaks:** An API returns 200 with an error in the body → monitoring (Datadog, CloudWatch) cannot alert because it only tracks status codes. Result: production fails silently for hours before anyone notices through user reports.
  - **In production:** A health check endpoint (GET /health) must return 200 when healthy and 503 when unhealthy. Load balancers (ALB, nginx upstream) rely on this status code to remove failing instances. Returning 200 even though the service is dead → the LB does not remove it → users get errors.

- **1xx Informational — the request is being processed**
  - **Why:** 100 Continue: the server says 'ok, go ahead and send the body' after checking the headers. This avoids uploading a large file that the server would reject based on the headers alone.
  - **When it breaks:** The client sends Expect: 100-continue but the server does not support it → the client times out waiting for 100 → the upload fails even though the server is ready to receive. Some proxies strip the Expect header → unpredictable behavior.
  - **In production:** S3/GCS multipart uploads use 100 Continue to avoid sending a large chunk only to find out that authentication failed. When debugging upload timeouts, check whether the proxy (nginx, ALB) passes the Expect header through.

- **2xx Success — the server processed the request successfully**
  - **Why:** 200 OK ≠ 201 Created ≠ 204 No Content. Good API design distinguishes them clearly so the client knows whether it needs to read the body (204 = no body).
  - **When it breaks:** A DELETE API returns 200 with a body instead of 204 → the client tries to parse the body → error if the body is empty. A POST API that creates a resource returns 200 instead of 201 → the client does not know the resource was created and does not check the Location header to get the new ID.
  - **In production:** REST API design convention: POST /resources → 201 + Location header. DELETE /resources/{id} → 204 no body. PUT update → 200 + updated object. Correct status codes make client caching, retry logic, and monitoring work correctly.

- **3xx Redirect — the resource has moved**
  - **Why:** [RFC 9110 §15.4.2](https://datatracker.ietf.org/doc/html/rfc9110#section-15.4.2) specifies 301 Moved Permanently: clients and caches may cache the redirect permanently and need not ask the server again. [RFC 9110 §15.4.3](https://datatracker.ietf.org/doc/html/rfc9110#section-15.4.3) specifies 302 Found: not cached, every request must ask the server again. Use 301 for permanent redirects (HTTP→HTTPS); use 302 when the redirect may change (A/B tests, maintenance pages).
  - **When it breaks:** An HTTP → HTTPS redirect uses 302 instead of 301 → the browser does not cache it → every request to HTTP still pays an extra redirect round trip → higher latency, and HSTS cannot be enabled. Conversely: a 301 redirect to the wrong URL → cached permanently, hard to roll back.
  - **In production:** nginx config: return 301 https://$host$request_uri; for a permanent HTTP→HTTPS redirect. Combine it with the HSTS header (Strict-Transport-Security: max-age=31536000) so the browser no longer tries HTTP. Check the redirect chain with curl -L -v before deploying.

- **4xx Client Error — the request is at fault**
  - **Why:** 4xx = the client's fault, not the server's. 400=bad format, 401=not authenticated, 403=no permission, 404=does not exist. Debug: fix the request, do not restart the server.
  - **When it breaks:** A high 4xx rate on an API → usually a client code bug or wrong docs. A 401 spike → expired tokens or a secret rotation that was not deployed everywhere. Many 404s on resources that exist → wrong route config or ID format mismatch. Monitor the 4xx rate separately from 5xx.
  - **In production:** API gateways (Kong, AWS API GW) may return 429 Too Many Requests when rate limiting. Clients must handle 429 with exponential backoff + jitter, not retry immediately. Without this logic → cascade failure when the service is under stress.

- **5xx Server Error — the server is at fault**
  - **Why:** 5xx = the server failed, not the client. 500=unhandled exception, 502=upstream dead, 503=overloaded. Check the server log right away; do not fix the client.
  - **When it breaks:** 502 Bad Gateway from nginx usually means the app server crashed or is not listening on the right port. 503 during a deployment means the health check fails — the new version is not ready yet. Debug: check the app log, not the nginx log. The nginx error log only says 'connect() failed', not why.
  - **In production:** Blue-green deployment: when switching traffic to green, the LB checks that the health endpoint returns 200 before routing traffic. If the app starts slowly (JVM warm-up, DB connection pool) → it returns 503 for 10-30s → the LB keeps blue longer. Configure initialDelaySeconds in the Kubernetes readiness probe.

- **HTTP/1.1: text, keep-alive, but head-of-line blocking**
  - **Why:** [RFC 9112 §9.3](https://datatracker.ietf.org/doc/html/rfc9112#section-9.3) defines persistent connections (keep-alive): after a response completes, the TCP connection is kept open to be reused for the next request. HTTP/1.1 still serializes requests in order — the response must be received before the next request is sent (head-of-line blocking). Browsers open multiple parallel connections per domain (the exact number is a browser heuristic, not an RFC-mandated value) to work around this limit.
  - **When it breaks:** One slow request (slow DB query) blocks all subsequent requests on the same connection. Browsers opening 6 conn/domain is a workaround, but 6 connections have limits too. Result: a long waterfall in DevTools when a page has many resources.
  - **In production:** nginx's default keepalive_timeout is 75s — good enough for most cases. For upstream app servers, you need the keepalive directive in the upstream block to reuse connections instead of creating a new one per request. Without it → TCP handshake overhead grows under load.

- **HTTP/2: binary frames, multiplexing, HPACK compression**
  - **Why:** [RFC 9113](https://datatracker.ietf.org/doc/html/rfc9113) defines HTTP/2 with a binary framing layer: each request/response is a stream, and many streams are multiplexed over 1 TCP connection — no head-of-line blocking at the HTTP layer. [RFC 7541](https://datatracker.ietf.org/doc/html/rfc7541) defines HPACK header compression. The speed benefit depends on the number of assets, latency, and header reuse rate — there is no fixed number that applies to every workload.
  - **When it breaks:** HTTP/2 server push (the server proactively pushes resources) sometimes causes negative cache interactions — pushing resources already in the browser cache. HTTP/2 still has TCP-level HOL blocking (distinct from stream-level). HTTP/3/QUIC solves this.
  - **In production:** nginx: add http2 to the listen directive — listen 443 ssl http2. Check with curl -I --http2 https://yourdomain.com | head — seeing HTTP/2 200 means success. Cloudflare automatically enables H2 for all proxied traffic.

- **HTTPS = HTTP + TLS: encrypt + verify identity**
  - **Why:** [RFC 8446 §1](https://datatracker.ietf.org/doc/html/rfc8446#section-1) defines TLS 1.3 as providing 2 independent guarantees: confidentiality (encrypting the payload with a symmetric key after the handshake) and authentication (verifying the certificate to prevent MITM). Without certificate validation — e.g. blindly accepting a self-signed cert — encryption still works but identity cannot be verified, so an attacker can still MITM.
  - **When it breaks:** Expired cert → TLS handshake fails → the whole site/API is down, not just HTTPS. A common, preventable cause of downtime. Setting up auto-renewal (Let's Encrypt certbot) and an alert 30 days before expiry is mandatory.
  - **In production:** Let's Encrypt + certbot: run certbot renew from cron or a systemd timer. Cloudflare Universal SSL: free, auto-renewing, no cert management needed. For internal services: use certs from a private CA (HashiCorp Vault PKI, AWS Private CA).

- **TLS handshake: ClientHello → cert verify → key exchange → Finished**
  - **Why:** [RFC 8446 §4](https://datatracker.ietf.org/doc/html/rfc8446#section-4) defines the TLS 1.3 handshake: ClientHello → ServerHello + Certificate + CertificateVerify → Finished. ECDHE key exchange creates a shared secret without sending the private key over the wire — forward secrecy ensures old session keys are not compromised if the private key leaks later. If the cert is expired, mismatched, or from an untrusted CA → the handshake fails right at the certificate verification step, and no data is sent.
  - **When it breaks:** SNI mismatch: the server hosts many domains on 1 IP, the client sends the wrong SNI or none → the server returns the wrong cert → the handshake fails. Common when the nginx server_name is misconfigured or TLS termination at the LB does not pass SNI correctly to the backend.
  - **In production:** AWS ALB terminates TLS at the LB and forwards HTTP to EC2/containers. EC2 does not need a cert — simpler. But internal traffic (ALB→EC2) is unencrypted — with a compliance requirement for end-to-end TLS → use an NLB with TCP passthrough or mTLS.

- **tcpdump + HTTP**
  - **Why:** HTTP is plaintext → use `-A` to print the payload as ASCII, filter `tcp port 80` (or the app's port); combine with `-w` to save a pcap and open it in Wireshark for timeline analysis.
  - **When it breaks:** HTTPS is not readable with tcpdump. Wrong port filter → packets missed. Capturing in a Linux container usually requires `--cap-add NET_ADMIN`.

## Step 1 — Send an HTTP request — see the raw wire format with curl -v

Developers usually only see code, not the raw request. `curl -v` shows exactly which bytes are sent. When debugging 400 Bad Request, this is the only sure way to know whether the headers are correctly formatted.

**When it breaks:** Skipping curl -v and only reading the SDK/framework error message → you do not know which headers were actually sent or whether the body is correctly formatted. Debugging a failing API without curl -v is debugging blind — hours lost just because of 1 missing header.

```bash
# Show all request + response headers
curl -v https://httpbin.org/get

# Add a custom header and a POST body
curl -v -X POST https://httpbin.org/post \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer mytoken123' \
  -d '{"name":"Alice"}'
```

**Observe with:**

```bash
curl -v output: '>' lines are the request headers sent, '<' lines are the response headers returned by the server. Look for the '< HTTP/1.1 XXX' line to see the first status code. '*' lines are curl metadata (TLS info, redirect, etc). nghttp -v https://domain.com to see HTTP/2 frames in detail.
```

## Step 2 — Read and understand the status code in the response

curl -v shows exactly the HTTP request sent and the response received, including all headers. When debugging 400 Bad Request, this is the only sure way to know whether the headers are correctly formatted — '>' lines are the request headers sent, '<' lines are the response headers returned by the server. Skipping curl -v and only reading the SDK/framework error message → you do not know which headers were actually sent.

**When it breaks:** Code checks response.ok (true for 200-299) but not the specific status code → misses the difference between 200 vs 204 vs 201. Common: fetch() does not throw on 4xx — you must check response.ok or response.status manually.

```bash
# Get only the status code
curl -o /dev/null -s -w '%{http_code}' https://httpbin.org/status/404

# Follow redirects and show the chain
curl -v -L https://httpbin.org/redirect/2

# Show specific response headers
curl -I https://httpbin.org/get
```

**Observe with:**

```bash
curl -o /dev/null -s -w '%{http_code}\n%{time_total}\n' URL — prints the status code and total time. Browser DevTools → Network tab: filter by status (4xx, 5xx), check the Timing tab to see TTFB. tcpdump port 80 to see raw, unencrypted HTTP/1.1 requests/responses.
```

## Step 3 — Compare HTTP/1.1 vs HTTP/2 in practice

HTTP/2 is not used automatically — the server must support it and negotiate it via ALPN in the TLS handshake. You need to know this to configure nginx correctly and to debug when H2 fails to negotiate.

**When it breaks:** nginx does not enable http2 in the listen directive → client and server negotiate HTTP/1.1 via ALPN → the multiplexing benefit is lost → pages load slowly under many concurrent requests. Easy to check: curl -I --http2 domain.com | head -1 must show 'HTTP/2 200'.

```bash
# See which HTTP version the server uses
curl -I --http1.1 https://www.google.com 2>&1 | head -5
curl -I --http2 https://www.google.com 2>&1 | head -5

# Show ALPN negotiation in TLS
openssl s_client -connect www.google.com:443 \
  -alpn h2,http/1.1 2>&1 | grep 'ALPN\|Protocol'
```

**Observe with:**

```bash
curl -I --http2 https://yourdomain.com | head -2 — the first line must be 'HTTP/2 200' if H2 is active. nghttp -v https://yourdomain.com to see each HTTP/2 frame (HEADERS, DATA, SETTINGS). Browser DevTools → Network → Protocol column to see h2 or http/1.1.
```

## Step 4 — TLS handshake — use openssl to inspect the cert and handshake

[RFC 7301](https://datatracker.ietf.org/doc/html/rfc7301) defines ALPN (Application-Layer Protocol Negotiation): a TLS extension that lets client and server negotiate the application protocol during the TLS handshake. HTTP/2 requires ALPN with the value 'h2'; if the server does not advertise 'h2' in ALPN → the client falls back to HTTP/1.1. HTTP/2 is not enabled automatically when upgrading nginx — you must add http2 to the listen directive and the server must have TLS.

**When it breaks:** The cert's SANs (Subject Alternative Names) do not include the subdomain in use → TLS verification fails → curl: SSL certificate problem: does not match. Common when a wildcard cert *.example.com does not cover sub.sub.example.com (a wildcard only matches 1 level).

```bash
# Show TLS handshake details
openssl s_client -connect example.com:443 \
  -servername example.com </dev/null 2>&1

# Show only cert info
openssl s_client -connect example.com:443 \
  -servername example.com </dev/null 2>&1 | \
  openssl x509 -noout -text | grep -E 'Subject:|Not After:|DNS:'
```

**Observe with:**

```bash
echo | openssl s_client -connect domain.com:443 2>/dev/null | openssl x509 -noout -dates — shows Not Before and Not After. grep DNS: to see all SANs. The result 'Verify return code: 0 (ok)' means the cert is valid. tcpdump port 443 to capture the TLS handshake bytes (see ClientHello, ServerHello in Wireshark).
```

**Symptoms when it breaks:**

- The browser shows ERR_CERT_DATE_INVALID, curl reports a verify error: curl -v https://example.com 2>&1 | grep 'error' shows: 'SSL certificate problem: certificate has expired' — or openssl confirms: 'Verify return code: 10 (certificate has expired)'
- The TLS handshake fails because a wildcard cert does not cover a sub-subdomain: curl -v https://api.staging.example.com 2>&1 | grep 'error': 'SSL: no alternative certificate subject name matches target host name api.staging.example.com' — *.example.com does not match 2 levels of subdomain

**How to fix:**

1. Confirm the cert has expired and when it expired

   ```bash
   echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -dates
   ```
2. Renew the cert with certbot (Let's Encrypt) if you use LE

   ```bash
   sudo certbot renew --cert-name example.com --dry-run && sudo certbot renew --cert-name example.com
   ```
3. Reload nginx after the new cert is deployed

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

## Step 5 — Debug 4xx: tell 400 vs 401 vs 403 vs 404 apart

When you see 'certificate verify failed', you need to determine: which CA issued the cert, when it expires, and whether the SAN matches the domain. openssl s\_client -connect domain:443 -servername domain returns the full certificate chain and the verify result — no browser needed. [RFC 9110 §4.3.4](https://datatracker.ietf.org/doc/html/rfc9110#section-4.3.4) specifies that certificate validation includes checking that the SAN (Subject Alternative Names) matches the request target.

**When it breaks:** Getting 403 but debugging it like 401 (checking the token) → wasted time. 403 means the token is valid but the role/permission is insufficient → check the IAM policy, database permissions, or RBAC config. 401 vs 403 call for two completely different actions.

```bash
# Simulate errors with httpbin
# 400 Bad Request
curl -v -X POST https://httpbin.org/post \
  -H 'Content-Type: application/json' \
  -d 'invalid-json-{'

# 401 Unauthorized
curl -v https://httpbin.org/basic-auth/user/pass

# 404 Not Found
curl -v https://httpbin.org/status/404
```

**Observe with:**

```bash
curl -v URL 2>&1 | grep '< HTTP' — see the status code right away. Browser DevTools → Network → filter Fetch/XHR, click the request, check the Response tab: the body usually has a clearer error message. Use httpie (http GET url) for colored output that is easier to read than curl.
```

## Step 6 — Debug 5xx: when does 502 Bad Gateway usually happen?

502 = nginx/the load balancer received the request but the upstream (app server) returned an error or did not respond. It is not an nginx error — check the app logs. 503 = the upstream is not available (overloaded or dead).

**When it breaks:** 502 in the nginx error log: 'connect() failed (111: Connection refused)' → the app server is not running on that port. '(110: Connection timed out)' → the app server is overloaded or a firewall is blocking. Tell these 2 cases apart with netstat -tlnp | grep PORT.

```bash
# Check nginx access log: look for 5xx
sudo tail -f /var/log/nginx/access.log | grep ' 5[0-9][0-9] '

# Check nginx error log
sudo tail -f /var/log/nginx/error.log

# Check upstream status with curl
curl -v http://localhost:8080/health  # directly to the app server
curl -v http://localhost:80/health    # through nginx
```

**Observe with:**

```bash
sudo tail -f /var/log/nginx/error.log — see the detailed error message for 502/503. curl -v http://localhost:APP_PORT/health — test the app server directly, bypassing nginx. journalctl -u your-app.service -f — watch the app crash log in real time. netstat -tlnp | grep APP_PORT — verify the app is listening.
```

**Symptoms when it breaks:**

- The client gets 502 Bad Gateway, the app server is running but under heavy load: sudo tail -f /var/log/nginx/error.log shows: '2024/01/15 10:23:45 [error] 1234#0: *567 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 10.0.0.5, upstream: "http://127.0.0.1:8080/api/data"'
- The client gets 502, the app server is not running on that port: sudo tail -f /var/log/nginx/error.log shows: 'connect() failed (111: Connection refused) while connecting to upstream, upstream: "http://127.0.0.1:8080/"'

**How to fix:**

1. Distinguish timeout vs refused: timeout = the app is alive but overloaded, refused = the app is not running

   ```bash
   sudo ss -tlnp | grep 8080  # no output → the app is not running on port 8080
   ```
2. If the app is not running: restart the service and verify

   ```bash
   sudo systemctl restart your-app.service && sudo journalctl -u your-app.service -n 30
   ```
3. If it times out due to overload: temporarily increase nginx proxy_read_timeout and check app performance

   ```bash
   curl -w '%{time_total}\n' -o /dev/null -s http://localhost:8080/health  # measure actual upstream latency
   ```

**Scripted:** Cron: * * * * * /usr/local/bin/http-health-probe.sh http://localhost:8080/health 2000. Requires the bc package.

```bash
#!/bin/bash
# Health probe: check HTTP status code + latency, alert on failure or slowness
# Run from cron every 1 minute
URL=${1:-"http://localhost:8080/health"}
THRESHOLD_MS=${2:-2000}  # alert if > 2s
RESULT=$(curl -o /dev/null -s -w '%{http_code} %{time_total}' --max-time 5 "$URL")
CODE=$(echo "$RESULT" | awk '{print $1}')
TIME_S=$(echo "$RESULT" | awk '{print $2}')
TIME_MS=$(echo "$TIME_S * 1000" | bc | cut -d. -f1)
if [ "$CODE" != "200" ] || [ "$TIME_MS" -gt "$THRESHOLD_MS" ]; then
  logger -t http-probe "ALERT: $URL — HTTP $CODE, ${TIME_MS}ms (threshold ${THRESHOLD_MS}ms)"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $URL HTTP $CODE ${TIME_MS}ms"
fi
```

## Step 7 — Use Wireshark to view the TLS handshake + HTTP/2 frames

Wireshark + SSLKEYLOGFILE lets you decrypt HTTPS traffic locally for debugging. This technique is essential when curl/the browser do not give enough information — you can see each TLS record and HTTP/2 frame.

**When it breaks:** Without SSLKEYLOGFILE → Wireshark only shows 'Application Data' (encrypted) instead of HTTP headers/body. SSLKEYLOGFILE only works with curl, Firefox, Chrome — not with binaries that do not expose a key export hook.

```bash
# Capture HTTPS traffic with SSLKEYLOGFILE to decrypt it
export SSLKEYLOGFILE=/tmp/ssl-keys.log
curl https://example.com

# Open Wireshark:
# Edit → Preferences → Protocols → TLS
# → (Pre)-Master-Secret log filename: /tmp/ssl-keys.log
# Then filter: http2 or tls.handshake
```

**Observe with:**

```bash
sudo tcpdump -i any -w /tmp/capture.pcap port 443 — capture raw bytes. Open the file in Wireshark + load SSLKEYLOGFILE → filter 'http2' to see HEADERS frames, DATA frames. Wireshark → Statistics → HTTP2 → Requests to see a summary of all HTTP/2 streams. Browser DevTools → Security tab to see the TLS version and cipher suite in use.
```

## Step 8 — Capture 1 HTTP GET with tcpdump

Run `tcpdump -i any -n -A "tcp port 80"` then `curl http://example.com`. Mapping: 3-way handshake (SYN, SYN-ACK, ACK) → GET request → 200 OK response → FIN. Read the Flags column to tell each phase apart.

**Observe with:**

```bash
Drag the pcap into the Upload .pcap tab (lab `http` SEE section) to see the layer tree of each packet
```

## Common misconceptions

- **Wrong:** HTTP/2 is enabled automatically when you install a new nginx version
  **Right:** HTTP/2 requires adding the http2 parameter to the listen directive and negotiating via ALPN ([RFC 7301](https://datatracker.ietf.org/doc/html/rfc7301)) in the TLS handshake; in practice browsers only support HTTP/2 over TLS — no TLS, no HTTP/2.

Deploying a new nginx without seeing the multiplexing benefit because of missing config — check with curl -I --http2 domain.com, the first line must be HTTP/2 200. If you see HTTP/1.1 200 → ALPN did not negotiate h2.

- **Wrong:** A 301 redirect can be rolled back easily by changing the server config
  **Right:** [RFC 9110 §15.4.2](https://datatracker.ietf.org/doc/html/rfc9110#section-15.4.2) specifies that a 301 is cached permanently by the browser — once cached, the browser does not ask the server again until the user clears the cache. The server cannot force-expire a 301 already cached on the client side.

Redirecting to the wrong path with 301 instead of 302 → users get stuck at the wrong destination even after the server config is fixed. Always test redirect logic with 302 first, then switch to 301 once confirmed correct.

- **Wrong:** A 4xx error means the server is broken and needs a restart
  **Right:** [RFC 9110 §15.5](https://datatracker.ietf.org/doc/html/rfc9110#section-15.5) defines 4xx as errors caused by a bad client request (wrong format, missing auth, no permission, resource not found). [RFC 9110 §15.6](https://datatracker.ietf.org/doc/html/rfc9110#section-15.6) defines 5xx as the actual server errors. Debugging 4xx = fix the request, do not restart the server.

Restarting the server on 401/404 is completely the wrong direction and causes unnecessary downtime. 401 → check the token/credentials; 403 → check IAM/RBAC; 404 → check the URL and route config; 400 → check the body/header format.

- **Wrong:** HTTPS only encrypts data and does nothing else
  **Right:** TLS provides 2 independent guarantees per [RFC 8446 §1](https://datatracker.ietf.org/doc/html/rfc8446#section-1): (1) confidentiality — encrypting the payload; (2) authentication — verifying the certificate against MITM. Blindly accepting a self-signed cert → encryption works but identity is not verified → an attacker can still MITM.

An internal service using a self-signed cert with certificate validation disabled → traffic is encrypted but not authenticated. An attacker on the same network can MITM all internal traffic — a false sense of security.

- **Wrong:** HTTP/1.1 keep-alive and HTTP/2 multiplexing are the same feature
  **Right:** Keep-alive ([RFC 9112 §9.3](https://datatracker.ietf.org/doc/html/rfc9112#section-9.3)) reuses the TCP connection but still serializes requests — only 1 request/response is active at a time. HTTP/2 multiplexing ([RFC 9113 §5](https://datatracker.ietf.org/doc/html/rfc9113#section-5)) allows many parallel streams on 1 TCP connection without blocking each other.

This confusion leads to not knowing when to upgrade from HTTP/1.1 to HTTP/2: if a page has many small assets (CSS, JS, images), HTTP/2 multiplexing reduces latency significantly because there is no need to wait for the previous response before sending the next request.

- **Wrong:** tcpdump can see HTTPS plaintext
  **Right:** HTTPS is encrypted with TLS; tcpdump only sees TLS records (handshake + ciphertext), not the GET/POST body

You need SSLKEYLOGFILE + Wireshark to decrypt on the dev/test side. tcpdump does not decrypt traffic.

- **Wrong:** `tcp port 80` is enough to capture all HTTP
  **Right:** HTTP can run on ports 8080, 8000, 3000, 8443… Filter on the app's specific port, or use `tcp portrange 8000-8999`

Port 80 is the standard default, but dev apps often use other ports to avoid needing sudo to bind

## Try at home

**1.** See the raw wire format of an HTTP request and response — the most basic way to understand how HTTP works

```bash
# Show full request/response headers
curl -v https://httpbin.org/get

# Send a POST with a JSON body
curl -v -X POST https://httpbin.org/post \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
```

**Observe:** In the curl -v output: the line '> POST /post HTTP/1.1' confirms the method and path; the line '> Content-Type: ...' confirms the header was sent; '< HTTP/2 200' confirms the version and status. Look for the 'Content-Length' line to verify the body size. Compare the actual request with what curl -v shows.

**2.** Check the TLS cert of any site by hand — debug SSL errors without a browser

```bash
# Show cert details
openssl s_client -connect github.com:443 \
  -servername github.com </dev/null 2>&1 | \
  openssl x509 -noout -text | \
  grep -E 'Subject:|Not After:|DNS:'

# Faster: show only the expiry
echo | openssl s_client -connect github.com:443 2>/dev/null | \
  openssl x509 -noout -dates
```

**Observe:** Confirm: 'Subject: CN=github.com' (is the domain correct), 'Not After: ...' (how many days are left), 'DNS:*.github.com' (does the wildcard cover subdomains). 'Verify return code: 0 (ok)' means the cert chain is valid. If you see an error code other than 0 → a specific cert problem.

**3.** Verify HTTP/2 negotiation — find out whether the server supports H2 and what ALPN returns

```bash
# Check the version in use
curl -I --http2 https://www.cloudflare.com 2>&1 | head -3

# Show ALPN negotiation
openssl s_client -connect www.cloudflare.com:443 \
  -alpn h2,http/1.1 2>&1 | grep -E 'ALPN|Protocol'

# Compare H1 vs H2 timing (multiple requests)
time curl -s --http1.1 https://www.cloudflare.com > /dev/null
time curl -s --http2 https://www.cloudflare.com > /dev/null
```

**Observe:** curl -I --http2 must return 'HTTP/2 200' on the first line. The openssl output must contain 'ALPN protocol: h2' if the server supports H2. Timing comparison: H2 is usually a few ms faster than H1 thanks to HPACK and connection reuse. If H2 is slower for a single request → handshake overhead; H2 pays off with many concurrent requests.

**4.** Experiment with each status code — understand the difference between 4xx and 5xx by hand

```bash
# See the actual status codes
for code in 200 201 204 301 400 401 403 404 429 500 502 503; do
  printf "Status %s: " $code
  curl -o /dev/null -s -w '%{http_code}\n' \
    https://httpbin.org/status/$code
done
```

**Observe:** Each output line must exactly match the requested status code (e.g. 'Status 404: 404'). Note 301: curl -o /dev/null -s -w '%{http_code}' returns 301 (does not follow); adding -L returns 200 (after the redirect). Try adding -w '%{http_code} %{redirect_url}\n' to see the redirect URL.

**5.** Debug a redirect chain — find out where 301/302 lead and how many hops

```bash
# Follow and show the whole redirect chain
curl -v -L https://httpbin.org/redirect/3 2>&1 | grep -E '^[<>] |^\* '

# Show only the URLs in the chain
curl -L -o /dev/null -s -w '%{url_effective}\n' \
  https://httpbin.org/redirect-to?url=https://example.com
```

**Observe:** In the curl -v -L output: you see '< HTTP/1.1 302 FOUND' then '< Location: ...' for each redirect hop. Count the occurrences of '< HTTP' to know how many redirect hops there are. The final url_effective is the real URL after following the whole chain. If you see a redirect loop (more than 30 hops) → curl reports 'Maximum redirects reached'.

**6.** Decrypt HTTPS with SSLKEYLOGFILE — debug when curl does not give enough information and you need Wireshark

```bash
# Export TLS session keys
export SSLKEYLOGFILE=/tmp/tls-keys.log
curl https://httpbin.org/get > /dev/null
cat /tmp/tls-keys.log | head -5

# Capture at the same time to open in Wireshark
export SSLKEYLOGFILE=/tmp/tls-keys.log
sudo tcpdump -i any -w /tmp/capture.pcap 'host httpbin.org' &
curl https://httpbin.org/get
sudo pkill tcpdump
# Open Wireshark: Edit→Preferences→TLS→Pre-Master-Secret: /tmp/tls-keys.log
```

**Observe:** cat /tmp/tls-keys.log must have lines starting with 'CLIENT_RANDOM ...' — these are the session keys. Open capture.pcap in Wireshark and load the key file: the 'http2' filter must show HEADERS frames instead of 'Application Data'. If you still see 'Application Data' → the key file path is wrong or the curl version does not support SSLKEYLOGFILE.

**7.** `-A` prints the payload as ASCII → read raw HTTP requests/responses (plaintext only)

```bash
tcpdump -i any -n -A 'tcp port 80'
```

**Observe:** `curl http://example.com` in another terminal — watch for GET / HTTP/1.1 and the status line 200 OK

**8.** `-s0` captures full packets (no truncation), `-w` writes a pcap to open in Wireshark or upload to the playground SEE section

```bash
tcpdump -i any -n -s0 -w /tmp/http.pcap 'tcp port 80'
```

**Observe:** After capturing: `tcpdump -r /tmp/http.pcap` to read it back; or drag the file into the Upload .pcap tab in the SEE section

**9.** Filter SYN packets to debug the 3-way handshake / connection storms

```bash
tcpdump -i any -n 'tcp[tcpflags] & tcp-syn != 0'
```

**Observe:** Count SYNs when the browser loads 1 page — each origin host usually means 1 SYN/connection

## Review questions

**Question 1.** A client sends a POST request with a JSON body but forgets the Content-Type header. What does the server return?

1. 200 OK — the server guesses the content type
2. 400 Bad Request — the server cannot parse the body
3. 401 Unauthorized — missing authentication
4. 500 Internal Server Error — the server crashed

**Answer:** 400 Bad Request — the server cannot parse the body. **400 Bad Request** is correct: the Content-Type header tells the server 'this is JSON, parse it as JSON'. Without this header → many frameworks refuse to parse the body or parse it wrongly → return 400. This is a client error (the request lacks information), not a server error.

- **200 OK — the server guesses the content type**: The server should not guess the content type — that is undefined behavior and a security risk. The RFC requires Content-Type to be present.

- **401 Unauthorized — missing authentication**: 401 is about authentication (token/credentials), not body format.

- **500 Internal Server Error — the server crashed**: 500 only happens if the server has a bug with an unhandled exception. A good server validates first and returns 400.

**Question 2.** What is the most important difference between 301 and 302?

1. 301 is faster than 302 because it needs fewer RTTs
2. 301 is permanent (browser caches it), 302 is temporary (not cached)
3. 301 is for HTTP→HTTPS, 302 cannot be used for it
4. There is no practical difference

**Answer:** 301 is permanent (browser caches it), 302 is temporary (not cached). **301 Moved Permanently**: the browser caches this redirect and next time goes straight to the new URL without asking the server. **302 Found**: not cached, the server is asked every time. Wrongly using 301 for something actually temporary → stale cache, hard to roll back.

- **301 is faster than 302 because it needs fewer RTTs**: Both cost 1 RTT for the redirect. Speed is not the difference.

- **301 is for HTTP→HTTPS, 302 cannot be used for it**: HTTP→HTTPS redirects usually use 301 (permanent), but 302 works technically too. This is not a hard rule.

- **There is no practical difference**: The caching difference is very practical, especially for SEO and backward compatibility.

**Question 3.** You get 401 vs 403 — what should you do next?

1. Both require restarting the server
2. 401: send/fix credentials; 403: credentials are present but lack permission — check permissions
3. 401: the server is dead; 403: the resource does not exist
4. Both are server errors, check the server log

**Answer:** 401: send/fix credentials; 403: credentials are present but lack permission — check permissions. **401 Unauthorized**: not authenticated, or the token is wrong/expired → resend with the correct Authorization header. **403 Forbidden**: authenticated successfully but the user lacks permission → check the role/permission in the database, not the token.

- **Both require restarting the server**: 4xx are client errors, unrelated to the server. Restarting the server does not solve anything.

- **401: the server is dead; 403: the resource does not exist**: 401 does not mean the server is dead (that is 5xx). 403 does not mean it does not exist (that is 404).

- **Both are server errors, check the server log**: 4xx = client error. The server works normally and only rejects the request for a valid reason.

**Question 4.** What HTTP/1.1 problem does HTTP/2 solve?

1. HTTP/2 adds HTTPS support (HTTP/1.1 does not have it)
2. HTTP/2 solves head-of-line blocking by multiplexing many requests over 1 connection
3. HTTP/2 is faster because it uses UDP instead of TCP
4. HTTP/2 reduces latency by dropping the TLS handshake

**Answer:** HTTP/2 solves head-of-line blocking by multiplexing many requests over 1 connection. **Multiplexing** is the main breakthrough: many HTTP requests/responses interleave over 1 TCP connection using binary frames. HTTP/1.1 must wait for the previous response before sending the next (or open 6 conn/domain). H2 = 1 conn doing the work of 6 conns.

- **HTTP/2 adds HTTPS support (HTTP/1.1 does not have it)**: HTTPS worked with HTTP/1.1 long before. HTTP/2 does not 'add' HTTPS — however, browsers in practice only support H2 over TLS.

- **HTTP/2 is faster because it uses UDP instead of TCP**: HTTP/2 still uses TCP. Only HTTP/3 (QUIC) uses UDP. H2 still has TCP-level HOL blocking.

- **HTTP/2 reduces latency by dropping the TLS handshake**: HTTP/2 does not drop TLS. The TLS handshake is still necessary and cannot be skipped.

**Question 5.** At which step does the TLS handshake fail if the cert has expired?

1. Step 1 — ClientHello cannot be sent
2. Step 2 — The client verifies the cert and rejects it because Not After has passed
3. Step 3 — Key exchange fails because of an old key
4. Step 4 — The Finished message is rejected

**Answer:** Step 2 — The client verifies the cert and rejects it because Not After has passed. The client verifies the certificate at **step 2** when it receives ServerHello + Certificate. The checks include: is the CA trusted, does the domain match the SAN, and **is the current time within \[Not Before, Not After\]**. Expired cert → fails right here, does not continue.

- **Step 1 — ClientHello cannot be sent**: ClientHello only sends capabilities and has nothing to do with the cert. The cert has not been sent yet at step 1.

- **Step 3 — Key exchange fails because of an old key**: Key exchange uses an ECDHE ephemeral key, not the key in the cert. An expired cert does not affect key exchange if verification has passed.

- **Step 4 — The Finished message is rejected**: The Finished message confirms that the handshake succeeded. If the cert fails at step 2, the handshake has already aborted and never reaches step 4.

**Question 6.** How does 502 Bad Gateway differ from 503 Service Unavailable?

1. 502 = client error; 503 = server error
2. 502 = the gateway received an invalid response from the upstream; 503 = the upstream is not available (overloaded/dead)
3. Both mean the same thing, only the config differs
4. 502 = TLS error; 503 = DNS error

**Answer:** 502 = the gateway received an invalid response from the upstream; 503 = the upstream is not available (overloaded/dead). **502**: nginx/the LB connected to the upstream but the upstream returned an invalid response or crashed midway. **503**: the upstream is completely unavailable — overloaded (rate limit), not ready yet (deployment), or dead. Debugging differs: 502 → check the app crash log; 503 → check capacity/deployment.

- **502 = client error; 503 = server error**: Both are 5xx = server errors. No 5xx is a 'client error'.

- **Both mean the same thing, only the config differs**: 502 and 503 have clearly different causes and debug paths. They are not the same.

- **502 = TLS error; 503 = DNS error**: TLS and DNS errors do not produce 502/503 — they fail before HTTP even starts.

**Question 7.** Why does a Wireshark capture of HTTPS only show 'Application Data' instead of HTTP headers?

1. HTTPS uses a different port so Wireshark does not understand it
2. TLS encrypts the entire HTTP payload after the handshake — Wireshark does not have the session key to decrypt it
3. HTTP/2 is binary so Wireshark cannot decode it
4. Wireshark needs the right filter to show it

**Answer:** TLS encrypts the entire HTTP payload after the handshake — Wireshark does not have the session key to decrypt it. **TLS encrypts** the entire L7 payload once the handshake completes. Wireshark sees the bytes but cannot decrypt them because it does not have the session keys (derived from ECDHE — never sent over the wire). Solution: use `SSLKEYLOGFILE` to export the keys from the browser/curl, then load them into Wireshark.

- **HTTPS uses a different port so Wireshark does not understand it**: Wireshark works with port 443 just fine. It still shows the TLS handshake and TCP segments.

- **HTTP/2 is binary so Wireshark cannot decode it**: H2's binary framing is a different matter — Wireshark can still decode H2 over cleartext. The problem here is TLS encryption.

- **Wireshark needs the right filter to show it**: The right filter does not help if the data is encrypted. Filters only show/hide packets.

**Question 8.** Why can tcpdump NOT see the HTTP body when accessing https://example.com?

1. Because HTTPS uses UDP
2. Because the payload is encrypted by TLS
3. Because tcpdump blocks HTTPS
4. Because port 443 does not support filtering

**Answer:** Because the payload is encrypted by TLS. TLS encrypts all application data after the handshake; tcpdump only sees TLS records (plaintext handshake + ciphertext inside).

- **Because HTTPS uses UDP**: HTTPS still uses TCP

- **Because tcpdump blocks HTTPS**: tcpdump does not block any protocol

- **Because port 443 does not support filtering**: Port 443 can be captured perfectly well, only the payload is encrypted

## Flashcards

- **What does an HTTP request consist of?**
  Request line (method + path + version) + Headers (key: value) + blank line + Body (optional). Example: POST /api/users HTTP/1.1 \r\nContent-Type: application/json\r\n\r\n{"name":"Alice"}
  *Know the structure to debug 400 Bad Request — the server usually rejects because of a missing header or a malformed body, not a network error.*

- **What does an HTTP response consist of?**
  Status line (version + code + reason) + Headers + blank line + Body. Example: HTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n{"id":42}
  *Status code + headers are everything the server tells the client. Read the status first, then the body error message — never read the body before checking the status.*

- **GET vs POST — how do they differ technically?**
  GET: no body, params in the URL (?key=val). POST: has a body, params in the body. GET can be cached, POST is not cached by default. GET is idempotent, POST is not.
  *API design: GET = read (safe + idempotent), POST = create. Using them wrongly → wrong caching, bookmarks that do not work, the browser warning 'resubmit form?'*

- **What is idempotent? Which methods are idempotent?**
  Calling many times = the same result as calling once. GET, PUT, DELETE, HEAD, OPTIONS are idempotent. POST, PATCH are not idempotent.
  *Important for retry logic: if a method is idempotent, retrying is safe. POST is not idempotent → retries create duplicate records → you need an idempotency key.*

- **Status 204 No Content — what does the body look like?**
  204 = processed successfully but there is NO body. The client must not read the body (the spec says so). Used for: successful DELETE, PUT updates that return no data.
  *Parsing the body of a 204 on the client is a bug. Some frameworks auto-return 204 when the handler returns nothing — handle it correctly on the client side.*

- **304 Not Modified — how does it work?**
  The client sends If-None-Match (with an ETag) or If-Modified-Since. The server compares: if the resource has not changed → returns 304 with no body. The client reuses its cached copy.
  *304 is the conditional GET mechanism — saves a lot of bandwidth. If an API returns 304 but the client does not cache correctly → stale data without anyone noticing.*

- **429 Too Many Requests — what should you do?**
  The server is rate limiting. Check the headers: Retry-After (how long to wait), X-RateLimit-Remaining (how much quota is left). You must implement exponential backoff, not retry immediately.
  *Retrying immediately after a 429 = your IP or key gets banned. Most APIs (GitHub, AWS, Stripe) have rate limits — handle 429 properly in production code.*

- **What does HTTP/1.1 Keep-Alive do?**
  Reuses the TCP connection for many requests instead of opening a new TCP connection each time. Header Connection: keep-alive. Reduces 3-way handshake overhead.
  *Before keep-alive: every HTTP request = 1 new TCP handshake = 1.5 RTT overhead. Keep-alive greatly reduces the number of handshakes, which matters especially with high latency.*

- **What problem does HTTP/2 multiplexing solve?**
  HTTP/1.1: 1 request at a time on 1 TCP conn (pipelining broken). H2: many parallel streams on 1 conn using binary frames. Browsers no longer need 6 conn/domain.
  *Sites with many assets (10-50 JS/CSS/images): HTTP/1.1 has to queue → head-of-line blocking. H2 multiplexing = everything loads in parallel → Page Load Time drops noticeably.*

- **What is HPACK in HTTP/2?**
  Header compression for HTTP/2. Uses: (1) a static table (common headers such as :method, :path), (2) a dynamic table (headers already sent in the session), (3) Huffman encoding.
  *HTTP headers repeat on every request (User-Agent, Cookie, Accept...) and can take 500-1000 bytes. HPACK compresses them to a few dozen bytes → significantly less overhead, especially on mobile.*

- **What is SNI (Server Name Indication)?**
  An extension in the TLS ClientHello: the client includes the destination hostname it wants to connect to. The server uses SNI to choose the right certificate when hosting many domains on the same IP.
  *Without SNI: 1 IP can only serve 1 cert → HTTPS virtual hosting is impossible. SNI is why CDNs/clouds can host millions of domains on few IPs.*

- **What is forward secrecy (PFS)? Why does it matter?**
  Each TLS session uses a different ephemeral key (ECDHE). The session key is not derived from the server's private key → compromising the server key later cannot decrypt old traffic.
  *Without PFS: if the private key is stolen later, the attacker can decrypt all recorded traffic. PFS keeps past sessions safe even if the key is exposed.*

- **What is ALPN? How does it relate to HTTP/2?**
  Application-Layer Protocol Negotiation — a TLS extension that lets client + server negotiate the protocol (h2 vs http/1.1) during the TLS handshake without an extra round trip.
  *HTTP/2 needs ALPN to negotiate the 'h2' protocol with the server. No ALPN → fallback to HTTP/1.1. Check the nginx config: `listen 443 ssl http2`.*

- **A BPF filter that captures only SYN packets?**
  `tcp[tcpflags] & tcp-syn != 0` — checks the SYN bit in the flags byte (offset 13 in the TCP header).
