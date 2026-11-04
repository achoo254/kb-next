---
source: lab/dns
sourceHash: 2026-04-24T06:13:24.515Z
---
# The DNS protocol

Estimated time: 45 minutes. This lesson has an interactive playground: [Open the playground on Học Cloud](https://hoc-cloud.inetdev.io.vn/lab/dns).

## Quick summary

- **Stub resolver (client)**
  - **Why:** [RFC 1034 §5.3.1](https://datatracker.ietf.org/doc/html/rfc1034#section-5.3.1) defines the stub resolver as the simplest DNS client component, living inside the OS — it does not perform recursive resolution itself but only forwards queries to the configured recursive resolver (usually via /etc/resolv.conf). The stub resolver receives the final response and returns it to the application. If the stub resolver is broken or resolv.conf is wrong → every domain fails even though IP connectivity still works.
  - **When it breaks:** If /etc/resolv.conf points to the wrong resolver IP (for example after switching networks) → every DNS query times out, and every service that depends on hostnames goes down even though pinging IPs still works.
  - **In production:** On an Ubuntu VPS, after installation check /etc/resolv.conf or /etc/systemd/resolved.conf to make sure the stub resolver points to the right upstream (8.8.8.8 or the cloud provider's resolver).

- **Recursive resolver (8.8.8.8, ISP)**
  - **Why:** [RFC 1034 §4.3.2](https://datatracker.ietf.org/doc/html/rfc1034#section-4.3.2) defines recursive resolution: the recursive resolver receives a query from the stub and performs the whole Root → TLD → Authoritative chain on the client's behalf. The resolver sends iterative queries step by step, assembles the result and returns it to the stub along with the TTL. Google 8.8.8.8 and Cloudflare 1.1.1.1 are public recursive resolvers; ISPs usually provide their own resolver, but some inject responses for NXDOMAIN.
  - **When it breaks:** If you use an ISP resolver that redirects NXDOMAIN → an ad page, backend code receives HTML instead of a DNS error → a hard-to-debug bug. Or if outbound port 53 to the resolver is blocked, every DNS query fails.
  - **In production:** When deploying a VPS, configure a reputable resolver (1.1.1.1 or 8.8.8.8) instead of the ISP default. This is especially important when the app calls external APIs by hostname.

- **Root server (.)**
  - **Why:** [RFC 1034 §3.6](https://datatracker.ietf.org/doc/html/rfc1034#section-3.6) defines the root server as the top of the DNS hierarchy — it only knows the NS records of each TLD, not the IP of any specific domain. There are 13 root IP addresses (a–m.root-servers.net), each using anycast IPs with many physical instances; in total there are >1800 instances worldwide according to data from [root-servers.org](https://root-servers.org).
  - **When it breaks:** If the root servers are unreachable (rare, but it happens when a corporate firewall blocks outbound UDP 53 to the anycast IPs) → every cold DNS lookup fails; only cache hits still work.
  - **In production:** No direct configuration is needed — but understanding root servers explains why DNS is distributed and why there is no 'central DNS database' to query.

- **TLD server (.com, .net, .vn)**
  - **Why:** [RFC 1034 §3.6](https://datatracker.ietf.org/doc/html/rfc1034#section-3.6) defines TLD servers as managing zone delegation: they know the NS records of every domain in that TLD and return referrals to recursive resolvers. The .com TLD server knows that ns1.example.com is authoritative for example.com, but does not know the IP of example.com. When you buy a new domain and set its nameservers, the TLD needs 24–48h to propagate the NS records.
  - **When it breaks:** When you buy a new domain and point its nameservers → the TLD needs 24-48h to propagate the new NS records. During that time the domain does not resolve — it is not a code bug.
  - **In production:** When you change domain registrar or move to Cloudflare DNS, the NS records are changed at the registrar → the TLD updates → resolvers around the world gradually learn the new NS according to the TTL.

- **Authoritative server (ns1.example.com)**
  - **Why:** [RFC 1035 §4.1.1](https://datatracker.ietf.org/doc/html/rfc1035#section-4.1.1) defines the AA (Authoritative Answer) bit in the DNS message header: when set = 1, the response comes directly from the zone's authoritative server — not from a resolver's cache. The authoritative server is the only place that stores the real records; every resolver only caches a copy according to the TTL. A response from a resolver's cache has AA=0.
  - **When it breaks:** If the authoritative server is down or has no record → the recursive resolver gets SERVFAIL or NXDOMAIN → the whole domain is unreachable, including web, email and API.
  - **In production:** When you use Cloudflare/Route53 as your DNS provider, that is exactly the authoritative server. Every A record, CNAME and TXT you create in the dashboard lives on this authoritative server.

- **TTL (Time To Live)**
  - **Why:** [RFC 1034 §3.5](https://datatracker.ietf.org/doc/html/rfc1034#section-3.5) defines TTL as the time in seconds that a resolver is allowed to cache a record before asking the authoritative server again. A high TTL reduces query load but slows propagation when something changes. Before an IP migration: lower the TTL to 300s for at least 1 TTL cycle (equal to the current TTL) so that all resolvers flush their cache, then change the A record.
  - **When it breaks:** Changing the server IP while TTL=86400 without lowering the TTL first → users are stuck on the old IP for up to 24h → downtime or split-brain (some users see the new server, others the old one).
  - **In production:** VPS migration procedure: (1) Lower the TTL to 300s, wait 24h. (2) Move traffic to the new server. (3) Once stable, raise the TTL back to 3600-86400. Step 1 is mandatory and must not be skipped.

- **A / AAAA record**
  - **Why:** A maps a domain → IPv4 ([RFC 1035](https://datatracker.ietf.org/doc/html/rfc1035)), AAAA → IPv6. Every web request needs at least one of these two records. Browsers prefer to ask for AAAA first (Happy Eyeballs) and fall back to A if it is missing.
  - **When it breaks:** If you add an AAAA record pointing to a wrong IPv6 address (for example the server has not enabled IPv6) → roughly 30-40% of IPv6 users hit a 2-3 second timeout before falling back to the A record — a bad UX that is hard to trace.
  - **In production:** When you rent a VPS, take the public IPv4 address → create an A record. If the VPS has IPv6 → add AAAA. Both point to the same server. Cloudflare's proxy handles dual-stack automatically.

- **CNAME record**
  - **Why:** An alias: points one name to another name. www.example.com CNAME example.com. Do not use CNAME at the zone root, because a CNAME cannot coexist with other records — that violates [RFC 2181](https://datatracker.ietf.org/doc/html/rfc2181).
  - **When it breaks:** Putting a CNAME at the apex domain (example.com instead of www.example.com) → violates [RFC 2181](https://datatracker.ietf.org/doc/html/rfc2181); many DNS providers reject it or behave unpredictably → website down or email failing.
  - **In production:** Use CNAME for: www.yourdomain.com → yourdomain.com, or a subdomain pointing to a Heroku/Vercel/CDN hostname. Do not use CNAME for the apex — use an A record or an ALIAS record (supported by Cloudflare).

- **MX record**
  - **Why:** Points to the mail server that receives email for the domain. Without MX, email sent to the domain fails or bounces. MX has a priority (lower number = higher priority).
  - **When it breaks:** Missing MX or MX pointing to the wrong hostname → email sent to @yourdomain.com bounces immediately. Wrong priority (for example the backup server has a lower number than the primary) → email always goes through the backup even when the primary is fine.
  - **In production:** When you use Google Workspace or Zoho Mail for business email, they give you the MX records to create. Gmail example: ASPMX.L.GOOGLE.COM priority 1, ALT1... priority 5.

- **TXT record (SPF/DKIM/DMARC)**
  - **Why:** [RFC 7208](https://datatracker.ietf.org/doc/html/rfc7208) defines SPF: a TXT record listing the IPs/domains allowed to send email on behalf of the domain. [RFC 6376](https://datatracker.ietf.org/doc/html/rfc6376) defines DKIM: a digital signature made with a private key on the mail server, with the public key published via a DNS TXT record. [RFC 7489](https://datatracker.ietf.org/doc/html/rfc7489) defines DMARC: the policy for handling email that fails SPF/DKIM (none/quarantine/reject). Missing all 3 → email goes to spam or is rejected by Gmail/Outlook.
  - **When it breaks:** Missing SPF → Gmail/Outlook mark the email as suspected spam. SPF too strict (hard fail -all) while forgetting to list a server → email from a legitimate server is rejected. Missing DMARC → the domain is easy to spoof.
  - **In production:** Every time you add a new email provider (SendGrid, SES, Mailchimp) → you must update the SPF TXT record with an extra include. When setting up a VPS that sends email → add the VPS IP to SPF and configure a DKIM key pair.

- **Negative cache (NXDOMAIN)**
  - **Why:** [RFC 2308 §3](https://datatracker.ietf.org/doc/html/rfc2308#section-3) defines negative caching: when a domain does not exist (NXDOMAIN), the resolver caches that result according to the minimum TTL value in the parent zone's SOA record. NXDOMAIN caching prevents the resolver from repeatedly asking the authoritative server about a non-existent domain. After creating a new DNS record, you must wait for the SOA negative TTL to expire before the record resolves.
  - **When it breaks:** You create a new subdomain (api.yourdomain.com), but it had already been queried once before the record existed → the resolver cached NXDOMAIN → after creating the record it still errors for a few minutes → the developer thinks the configuration is wrong.
  - **In production:** When deploying a new feature that needs a new subdomain, create the DNS record BEFORE deploying the code. If you are already hit by the negative cache, use dig +trace or flush DNS to bypass it, or wait for the SOA minimum TTL to expire.

- **DoH (DNS over HTTPS)**
  - **Why:** [RFC 8484](https://datatracker.ietf.org/doc/html/rfc8484) defines DNS over HTTPS (DoH): the DNS query is encoded in DNS wire format and sent via HTTPS POST/GET to a specific endpoint (for example https://cloudflare-dns.com/dns-query). The query is encrypted by TLS — the ISP cannot see which hostname is being queried. Firefox enabled DoH by default from v83 (US). DoH concentrates DNS traffic on a few large providers and can bypass corporate DNS filters.
  - **When it breaks:** An app that uses DoH hardcoded to Cloudflare in a corporate environment → bypasses the DNS filter → the firewall blocks outbound connections on port 443 to 1.1.1.1 → the app cannot resolve any domain.
  - **In production:** A production VPS does not need DoH — resolver 1.1.1.1 over UDP 53 is enough. DoH is useful on a dev machine when you want to bypass the ISP or check DNS records from Cloudflare's point of view.

## Step 1 — Basic dig — view the A record

dig is the number one DNS debugging tool. Understanding dig's output = understanding the real DNS response, knowing how much TTL is left and who the authoritative server is. Without dig, debugging DNS is just guesswork.

**When it breaks:** If you skip dig and only use ping/curl to debug DNS → you cannot see the TTL, you do not know which resolver is in use, and you cannot tell a cache hit from an authoritative response → debugging blind.

```bash
# Query the default A record
dig example.com

# Important output:
# QUESTION SECTION: the domain being asked
# ANSWER SECTION: the result (IP)
# Query time: latency
# SERVER: the resolver in use
```

**Observe with:**

```bash
dig example.com — look at the TTL column in the ANSWER SECTION and the SERVER line to identify the resolver in use. Compare Query time: <5ms is a cache hit, >50ms is a fresh lookup.
```

**Symptoms when it breaks:**

- DNS returns NXDOMAIN even though the domain was just created, or the app cannot resolve an internal domain: dig api.internal.example.com shows 'status: NXDOMAIN' — and dig api.internal.example.com +search does not find it either, because /etc/resolv.conf lacks 'search internal.example.com', so the query does not get the domain suffix appended

**How to fix:**

1. Check whether /etc/resolv.conf has a search domain

   ```bash
   cat /etc/resolv.conf | grep -E 'nameserver|search|domain'
   ```
2. Add a search domain temporarily for testing (not persistent across reboots)

   ```bash
   echo 'search internal.example.com' | sudo tee -a /etc/resolv.conf && dig api.internal.example.com
   ```

## Step 2 — dig +trace — view the full recursive path

dig is a DNS client that lets you query a DNS server directly and see the raw response. The output includes the QUESTION SECTION (the domain queried), the ANSWER SECTION (record + TTL), and SERVER (the resolver in use). The TTL in the ANSWER SECTION is the number of seconds remaining in the resolver's cache. The Query time in the output is the RTT to the resolver — low latency (<5ms) is usually a cache hit, higher is a fresh lookup from the authoritative server, but the exact threshold depends on geographic location and the resolver.

**When it breaks:** Not using +trace when debugging propagation → you cannot tell 'has the authoritative server been updated yet' apart from 'the resolver still has the old cache' → hours of pointless waiting or a mistaken rollback.

```bash
# Trace each hop: Root → TLD → Authoritative
dig example.com +trace

# Sample result:
# .       518400  IN  NS  a.root-servers.net.
# com.    172800  IN  NS  a.gtld-servers.net.
# example.com. 86400 IN NS ns1.example.com.
# example.com. 3600  IN A  93.184.216.34
```

**Observe with:**

```bash
dig example.com +trace — read each NS delegation line from the root down. If you see the new IP at the authoritative server but dig example.com (without +trace) still returns the old IP → it is confirmed to be a cache issue, not a config error.
```

## Step 3 — View other record types

[RFC 1034 §4.3.2](https://datatracker.ietf.org/doc/html/rfc1034#section-4.3.2) describes the recursive resolution chain: Root → TLD → Authoritative. +trace forces dig to bypass the resolver's cache and perform the whole chain itself with iterative queries starting from the root. If +trace returns the new record but a normal dig still returns the old one → it is confirmed to be a cache issue at the resolver, not an authoritative server that has not been updated.

**When it breaks:** Only knowing how to query A records → blind to email (MX/TXT), blind to nameserver delegation (NS), blind to IPv6 (AAAA). When email lands in spam and you do not check the TXT SPF/DKIM records → you debug in the wrong direction.

```bash
# MX record — mail server
dig example.com MX

# TXT record — SPF/DKIM
dig example.com TXT

# NS record — nameservers
dig example.com NS

# AAAA record — IPv6
dig example.com AAAA
```

**Observe with:**

```bash
dig example.com TXT | grep -i spf — view the SPF value. dig example.com MX +short — list mail servers and their priority. dig example.com NS +short — confirm which nameservers are active.
```

## Step 4 — TTL and cache — verify in practice

The TTL decreases each time you ask (because the resolver already has it cached). First query TTL=3600, second query a few minutes later TTL=3540. When the TTL reaches 0, the resolver asks the authoritative server again. Understand this to avoid the confusion of 'why did I change the IP but still not see it'.

**When it breaks:** Not checking the TTL before a migration → changing the A record while the TTL is still 86400 → users stuck on the old IP for 24h → perceived downtime even though the new server is perfectly fine.

```bash
# Ask twice, watch the TTL decrease
dig example.com | grep -A2 'ANSWER'
# Wait 5 seconds
sleep 5
dig example.com | grep -A2 'ANSWER'
# The TTL will drop by ~5
```

**Observe with:**

```bash
watch -n 5 'dig example.com +short' — runs continuously every 5s so you can see the moment the cache expires and the new IP appears. Or dig example.com | grep -i ttl to see the current TTL.
```

**Symptoms when it breaks:**

- After an IP migration, users are still sent to the old server even though the A record was changed hours ago: dig example.com shows a large remaining TTL (for example: 'example.com. 82800 IN A 1.1.1.1') — the TTL was 86400s when the record was changed, and the resolver keeps caching the old IP until the TTL expires

**How to fix:**

1. Check the current TTL of the cached record

   ```bash
   dig example.com | awk '/ANSWER SECTION/{getline; print "TTL remaining:", $2, "seconds"}'
   ```
2. Bypass the cache with +trace to confirm the authoritative server has been updated

   ```bash
   dig example.com +trace +short | tail -5
   ```
3. For the next migration: lower the TTL to 300s at least 24h before changing the IP

   ```bash
   dig example.com | grep -E 'IN\s+A' | awk '{print "Current TTL:", $2, "seconds — wait this long for full propagation"}'
   ```

**Scripting it:** Create /etc/dns-check.conf with one line per entry: 'example.com 93.184.216.34'. Run it after a migration to monitor propagation. Cron: */5 * * * * /usr/local/bin/dns-batch-check.sh 8.8.8.8

```bash
#!/bin/bash
# Batch check many DNS records, alert if the IP differs from expected or the TTL is low
# Use after a migration to monitor propagation
RESOLVER=${1:-8.8.8.8}
INPUT_FILE=${2:-/etc/dns-check.conf}  # format: domain expected_ip
echo "=== DNS Batch Check $(date '+%Y-%m-%d %H:%M:%S') ==="
while IFS=' ' read -r DOMAIN EXPECTED; do
  [ -z "$DOMAIN" ] || [[ "$DOMAIN" == \#* ]] && continue
  RESULT=$(dig "$DOMAIN" A @"$RESOLVER" +short | head -1)
  TTL=$(dig "$DOMAIN" A @"$RESOLVER" | awk '/ANSWER SECTION/{getline; print $2}')
  STATUS="OK"
  [ "$RESULT" != "$EXPECTED" ] && STATUS="MISMATCH (got $RESULT)"
  [ -z "$TTL" ] && TTL="N/A"
  echo "[$STATUS] $DOMAIN → $RESULT (TTL:${TTL}s expected:$EXPECTED)"
done < "$INPUT_FILE"
```

## Step 5 — Ask the authoritative server directly — bypass the cache

[RFC 1034 §3.5](https://datatracker.ietf.org/doc/html/rfc1034#section-3.5) specifies that the resolver decrements the TTL every second while the record is in cache — the TTL in the response is not the original value but the number of seconds remaining. First query TTL=3600, second query 60s later TTL=3540. When the TTL reaches 0, the resolver asks the authoritative server again and resets the TTL to its original value. Understand this mechanism to calculate the right waiting time during a migration.

**When it breaks:** Only querying through the usual resolver → you do not know whether the authoritative server has been updated → you may wait for nothing or think the DNS provider has a problem when in fact the cache simply has not expired.

```bash
# Find the authoritative server
dig example.com NS +short

# Ask the authoritative server directly (no cache)
dig example.com @ns1.example.com A

# Compare with the usual resolver:
dig example.com @8.8.8.8 A
```

**Observe with:**

```bash
diff <(dig example.com @ns1.example.com A +short) <(dig example.com @8.8.8.8 A +short) — if the outputs differ, resolver 8.8.8.8 is caching the old record.
```

## Step 6 — Reverse DNS lookup (PTR record)

Reverse DNS maps IP → domain. Mail servers often check PTR as an anti-spam measure: if the IP has no PTR or the PTR does not match → the email is rejected. Hosting servers usually need PTR (rDNS) configured in the VPS control panel.

**When it breaks:** A VPS sends email without a configured PTR record (rDNS) → Outlook and Gmail fail the PTR check → the email is rejected or marked as spam. Many email providers refuse mail from IPs without a PTR.

```bash
# Reverse lookup for an IP
dig -x 93.184.216.34
# Or
nslookup 93.184.216.34

# Output:
# <ADDR-1>.in-addr.arpa. PTR example.com.
```

**Observe with:**

```bash
dig -x $(curl -s https://ipinfo.io/ip) — check the PTR record of the current VPS IP. If it returns NXDOMAIN or a generic hosting address → go to the VPS control panel to configure rDNS.
```

## Step 7 — DoH — checking with DNS over HTTPS

Checking via DoH confirms the record directly from Cloudflare/Google without going through the OS resolver. Useful when you suspect the ISP is tampering with DNS or when debugging from a corporate network with DNS filtering.

**When it breaks:** An app hardcodes a DoH endpoint (1.1.1.1:443) in an environment with a restrictive firewall → the connection is blocked → DNS fails completely even though UDP 53 still works. Hard to debug because the error message is usually a generic timeout.

```bash
# Query Cloudflare DoH with curl
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=example.com&type=A' \
  | python3 -m json.tool

# Query Google DoH
curl -s 'https://dns.google/resolve?name=example.com&type=A' \
  | python3 -m json.tool
```

**Observe with:**

```bash
curl -s 'https://dns.google/resolve?name=example.com&type=A' | python3 -m json.tool | grep -E 'data|TTL' — compare the DoH result with dig example.com @8.8.8.8 to confirm whether the ISP is tampering.
```

## Common misconceptions

- **Wrong:** The stub resolver goes and asks the Root, TLD, then Authoritative server itself
  **Right:** The stub resolver only forwards the query to the recursive resolver configured in /etc/resolv.conf — it does not perform the recursive lookup itself. Only the recursive resolver walks the whole Root → TLD → Authoritative chain itself, per [RFC 1034 §5.3.1](https://datatracker.ietf.org/doc/html/rfc1034#section-5.3.1).

When debugging a DNS failure, confusing the roles leads you to check the wrong place: if the stub resolver sends the query to the recursive resolver and the recursive resolver fails, the error shows up at the stub — you must check the recursive resolver, not the authoritative server.

- **Wrong:** Changing an A record changes DNS instantly worldwide
  **Right:** Resolvers cache a record according to its TTL at query time; if TTL=86400 when you change it, resolvers keep the cache for up to 24h per [RFC 1034 §3.5](https://datatracker.ietf.org/doc/html/rfc1034#section-3.5). Only dig +trace sees the new record immediately because it bypasses the cache.

Not lowering the TTL before a migration → users hit split-brain: some see the new server (cache expired), others the old server (cache still valid). The correct procedure: lower the TTL to 300s, wait a full cycle of the old TTL, and only then change the A record.

- **Wrong:** A CNAME can be placed at the apex domain (example.com itself)
  **Right:** [RFC 2181 §10.1](https://datatracker.ietf.org/doc/html/rfc2181#section-10.1) forbids a CNAME from coexisting with any other record at the same owner name; the apex domain (zone root) must have SOA and NS records → a CNAME at the apex violates the RFC. Use ALIAS/ANAME if you need the apex to point to a hostname.

Some DNS providers allow a CNAME at the apex, but the behaviour is undefined on other providers — changing provider will break the domain. Worse: a CNAME at the apex usually conflicts with MX records → email for the whole domain fails.

## Try at home

**1.** View the full recursive path from Root → TLD → Authoritative — understand how DNS finds the IP

```bash
dig example.com +trace
```

**Observe:** Read each block of the output: the first lines are the root servers, then the TLD NS, then the domain's NS, and finally the A record. Note the TTL in the 2nd column — each level has its own TTL.

**2.** Check a record's TTL — see how long until the cache expires, ask twice and watch the TTL decrease

```bash
dig example.com | grep -A5 'ANSWER SECTION'
# Wait 10 seconds
sleep 10
dig example.com | grep -A5 'ANSWER SECTION'
```

**Observe:** Compare the TTL between the 2 queries — the 2nd must be about 10 seconds lower than the 1st. If the TTL resets to its original value → the resolver has just asked the authoritative server again.

**3.** View SPF/DKIM/DMARC — check why the domain's email keeps landing in spam

```bash
# SPF
dig example.com TXT | grep spf

# DMARC
dig _dmarc.example.com TXT

# DKIM (you need to know the selector, usually 'google' or 'default')
dig google._domainkey.gmail.com TXT
```

**Observe:** A valid SPF must contain v=spf1 and end with -all or ~all. DMARC must contain v=DMARC1 and a p= field (none/quarantine/reject). Missing either one → email easily lands in spam.

**4.** Ask the authoritative server directly — bypass the resolver cache to see the record as it really is now

```bash
# Get the domain's NS
dig example.com NS +short

# Ask the authoritative server directly
dig example.com A @ns1.example.com

# Compare with the Google resolver
dig example.com A @8.8.8.8
```

**Observe:** If the IP from the authoritative server differs from the IP from @8.8.8.8 → Google's resolver is caching the old one; wait for the TTL to expire. If the authoritative server returns SERVFAIL → the problem is in the DNS config, not the cache.

**5.** Query DoH with curl — see the DNS response without going through the OS resolver; check this when you suspect the ISP is tampering with DNS

```bash
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=example.com&type=A' \
  | python3 -m json.tool | grep -E 'name|data|TTL'
```

**Observe:** Compare the data field (IP) from the DoH response with the output of dig example.com +short. If they differ → the ISP is redirecting DNS. The TTL in the JSON response is the real TTL from the authoritative server.

**6.** Reverse lookup — view an IP's PTR record, important for debugging email deliverability

```bash
# PTR of an IP
dig -x 8.8.8.8

# View the PTR of the server's IP
MY_IP=$(curl -s https://ipinfo.io/ip)
dig -x $MY_IP
```

**Observe:** A valid PTR record returns a hostname in the ANSWER SECTION. If you see NXDOMAIN or a generic hosting hostname (for example compute.amazonaws.com) → configure rDNS in the VPS control panel so email is not rejected.

## Review questions

**Question 1.** You type 'example.com' in the browser — what is the first step?

1. Open a TCP connection to 93.184.216.34 port 80
2. The stub resolver asks the recursive resolver for the IP
3. The browser asks the root server directly
4. The OS looks in /etc/hosts before asking DNS

**Answer:** The OS looks in /etc/hosts before asking DNS. The OS checks `/etc/hosts` (or `C:\Windows\System32\drivers\etc\hosts`) before asking DNS. If there is an entry in the hosts file → it is used immediately, no DNS needed. This is the override mechanism commonly used for local testing.

- **Open a TCP connection to 93.184.216.34 port 80**: To open a TCP connection you need the IP first — and the IP comes from DNS.

- **The stub resolver asks the recursive resolver for the IP**: Correct in essence, but not the first step — /etc/hosts is checked before DNS.

- **The browser asks the root server directly**: The browser does not ask the root server directly — that is the recursive resolver's job.

**Question 2.** How does a recursive resolver differ from a stub resolver?

1. The recursive resolver has a static IP, the stub resolver uses DHCP
2. The stub resolver only forwards the query, the recursive resolver itself asks Root → TLD → Authoritative
3. The recursive resolver stores the entire DNS database
4. The stub resolver is faster because it does not need the internet

**Answer:** The stub resolver only forwards the query, the recursive resolver itself asks Root → TLD → Authoritative. The stub resolver (in the OS) does not do recursion — it only forwards the question to 1 configured address (usually the gateway or 8.8.8.8). The recursive resolver is the one that actually asks each level of the DNS tree.

- **The recursive resolver has a static IP, the stub resolver uses DHCP**: Static IP/DHCP has nothing to do with the type of resolver.

- **The recursive resolver stores the entire DNS database**: No resolver stores the entire database — DNS is distributed, nobody has a full copy.

- **The stub resolver is faster because it does not need the internet**: The stub resolver still needs the network to forward the query; it is not 'faster' in that sense.

**Question 3.** A website is running and its A record is changed from 1.1.1.1 to <ADDR-2>. Users still see 1.1.1.1 after 1 hour. What is the most likely cause?

1. The authoritative server has not updated the new record yet
2. DNS over HTTPS is turned off
3. The old record's TTL is still high (for example 86400s), and the resolver is caching it
4. The browser caches the website's IP

**Answer:** The old record's TTL is still high (for example 86400s), and the resolver is caching it. Resolvers cache records according to the TTL. If the TTL is 86400s (24h, an example value per [RFC 1035 §3.2.1](https://datatracker.ietf.org/doc/html/rfc1035#section-3.2.1)) and the record has just been changed, the resolver keeps using its cache until the TTL expires. Fix: before changing the IP, lower the TTL to 300s and wait at least 24h for the old cache to expire.

- **The authoritative server has not updated the new record yet**: If the authoritative server had not been updated, +trace would show the old IP — that can be checked. But the resolver cache is the more common cause.

- **DNS over HTTPS is turned off**: DoH has nothing to do with caching the old IP.

- **The browser caches the website's IP**: The browser caches HTML/CSS; it does not cache DNS records in that way.

**Question 4.** Which command shows the full path from Root → TLD → Authoritative?

1. dig example.com @8.8.8.8
2. nslookup example.com
3. dig example.com +trace
4. curl -v https://example.com

**Answer:** dig example.com +trace. `dig +trace` skips the recursive resolver's cache and performs each step itself: ask the root → get the TLD's NS → ask the TLD → get the domain's NS → ask the authoritative server → get the record. This is a must-have command when debugging DNS propagation.

- **dig example.com @8.8.8.8**: dig @8.8.8.8 asks Google's resolver — Google may answer from cache, and you do not see each hop.

- **nslookup example.com**: nslookup returns the final result; it does not trace each step.

- **curl -v https://example.com**: curl makes an HTTP request; it does not trace the DNS path.

**Question 5.** Email sent from a server keeps landing in spam. Which DNS record should you check first?

1. A record — the mail server's IP
2. CNAME record — an alias for mail
3. TXT record — SPF, DKIM, DMARC
4. NS record — nameserver

**Answer:** TXT record — SPF, DKIM, DMARC. SPF (a TXT record) confirms which servers are allowed to send email for the domain. DKIM (a TXT record) adds a digital signature to the email. DMARC (a TXT record) specifies how to handle email that fails. Missing or wrong in any of them → spam filters block it.

- **A record — the mail server's IP**: An A record gives the IP; it has nothing to do with email authentication.

- **CNAME record — an alias for mail**: A CNAME for mail.example.com may be needed, but it is not the cause of spam.

- **NS record — nameserver**: An NS record only concerns nameservers; it does not affect email authentication.

**Question 6.** Which transport protocol does DNS use by default, and when does it switch to TCP?

1. Always TCP — because reliable delivery is needed
2. UDP port 53 by default; switches to TCP when the response is > 512 bytes or for a zone transfer
3. Always UDP port 53, never TCP
4. HTTP port 80 because of DNS over HTTPS

**Answer:** UDP port 53 by default; switches to TCP when the response is > 512 bytes or for a zone transfer. UDP 53 is used for ordinary queries because it is fast (no handshake). When the response is truncated (TC=1) — for example many MX records — the client reconnects over TCP 53. Zone transfers (AXFR) always use TCP because the data is large.

- **Always TCP — because reliable delivery is needed**: TCP costs an extra round trip for the handshake — too expensive for small queries.

- **Always UDP port 53, never TCP**: Not true — [RFC 7766](https://datatracker.ietf.org/doc/html/rfc7766) requires DNS implementations to support TCP.

- **HTTP port 80 because of DNS over HTTPS**: DoH is a different variant, not the default protocol.

**Question 7.** A CNAME record must not be placed at the apex domain (root domain). Why?

1. CNAME is slower than an A record
2. A CNAME at the apex violates the RFC because it cannot coexist with the SOA/NS records of the same name
3. The root domain needs IPv6, so it must use AAAA
4. CNAME only works with subdomains starting with www

**Answer:** A CNAME at the apex violates the RFC because it cannot coexist with the SOA/NS records of the same name. [RFC 2181](https://datatracker.ietf.org/doc/html/rfc2181): a CNAME must not be placed alongside other records with the same name. The apex domain must have SOA and NS records → a CNAME cannot be placed there. This is why CDNs such as Cloudflare created 'CNAME flattening' or the 'ALIAS record' as a workaround.

- **CNAME is slower than an A record**: Speed is not the reason — a CNAME does add 1 extra lookup hop, but that is not why it is forbidden.

- **The root domain needs IPv6, so it must use AAAA**: IPv6/AAAA has nothing to do with the reason for not using CNAME at the apex.

- **CNAME only works with subdomains starting with www**: CNAME works with any subdomain; it is not limited to 'www'.

**Question 8.** What is negative caching and when does it cause problems?

1. A cache storing broken IPs — always causes problems
2. A cache storing NXDOMAIN results — causes problems when a new record has just been created but you still get 'domain not found'
3. A cache that is cleared when there is a network error
4. A cache in the browser, not in DNS

**Answer:** A cache storing NXDOMAIN results — causes problems when a new record has just been created but you still get 'domain not found'. When a domain does not exist, the resolver caches the NXDOMAIN result according to the TTL from the SOA minimum field. If a new A record is created, a resolver that is caching NXDOMAIN will not see the new record until the cache expires. Fix: `dig +trace` to bypass the cache and see the authoritative response.

- **A cache storing broken IPs — always causes problems**: Negative caching does not store 'broken IPs' — it stores 'this domain does not exist'. It does not always cause problems.

- **A cache that is cleared when there is a network error**: The negative cache is not cleared by network errors — it expires according to the TTL.

- **A cache in the browser, not in DNS**: Browsers have their own DNS cache, but negative caching in DNS is a resolver-level concept.

## Flashcards

- **What is a stub resolver?**
  The simple DNS client in the OS. It does not recurse itself — it only forwards queries to the configured recursive resolver (/etc/resolv.conf).
  *If /etc/resolv.conf is wrong → every DNS query fails. This is the first place to check when debugging 'cannot resolve the domain'.*

- **What does a recursive resolver do?**
  Asks Root → TLD → Authoritative itself on behalf of the client. Caches results according to the TTL. Google 8.8.8.8 and Cloudflare 1.1.1.1 are recursive resolvers.
  *Most DNS latency happens here on a cache miss. A cache hit is usually < 1ms.*

- **What is a root server? How many are there?**
  13 clusters (a–m.root-servers.net) but hundreds of anycast instances around the world. They only know the NS of each TLD.
  *Root servers do not 'know' the records of a specific domain — they only say 'go ask the .com TLD'. Designed to be distributed so there is no single point of failure.*

- **A record vs AAAA record?**
  A → IPv4 (32 bit). AAAA → IPv6 (128 bit). Browsers use Happy Eyeballs: try AAAA first, fall back to A if needed.
  *Add an AAAA record to support IPv6. With only A, IPv6-only clients cannot connect.*

- **What does a CNAME record do? Its limitation?**
  An alias: points one name to another name. Limitation: not at the apex domain (it would have to coexist with SOA/NS).
  *www.example.com CNAME example.com lets you manage things in 1 place. But the apex domain must use an A record or ALIAS/CNAME flattening.*

- **What does an MX record need? What is the priority for?**
  An MX record points to the mail server that receives email. Priority: lower number = higher priority. You can have several MX records for failover.
  *Missing MX → email bounces. Several MX records with different priorities → failover: if the main server is down, email automatically moves to the backup.*

- **What are the SPF, DKIM and DMARC TXT records?**
  SPF: lists the IPs/domains allowed to send email. DKIM: a digital signature on the email. DMARC: the policy for handling email that fails SPF/DKIM.
  *Missing these 3 → email goes to spam. DMARC with p=reject is the strongest protection against email spoofing.*

- **What is TTL? What happens when you change an IP?**
  The number of seconds a resolver caches a record before asking again. Changing the IP while TTL=86400: users see the old IP for up to 24h.
  *Migration best practice: lower the TTL to 300s at least 24h BEFORE changing the IP. Once the migration is stable, raise the TTL again.*

- **What is a PTR record used for?**
  Reverse DNS: maps IP → domain. Example: <ADDR-1>.in-addr.arpa. → example.com.
  *Mail servers check PTR as an anti-spam measure. A VPS needs PTR (rDNS) configured in the control panel if it wants to send email without being rejected.*

- **Does DNS use UDP or TCP?**
  UDP 53 by default. TCP 53 when: the response is >512 bytes (TC=1), or for a zone transfer (AXFR). DoH uses TCP 443.
  *UDP needs no handshake → fast for small queries. When the data is large, UDP gets truncated → fall back to TCP to make sure all the data arrives.*

- **What is DoH (DNS over HTTPS)?**
  Encrypts DNS queries over HTTPS port 443. The ISP cannot see which domain is being asked.
  *Privacy: a traditional ISP sees every DNS query → knows which sites the user visits. DoH prevents this. Downside: it bypasses corporate DNS → IT admins cannot filter.*

- **What is negative caching?**
  Caching NXDOMAIN results (domain does not exist). Expires according to the TTL from the SOA minimum field.
  *Create a new DNS record → a resolver that is caching NXDOMAIN still answers 'does not exist'. Use dig +trace to bypass the cache and see the authoritative response.*

- **What is an NS record?**
  Nameserver: declares which server is authoritative for the zone. Example: example.com. NS ns1.example.com.
  *NS records are the delegation links in the DNS tree. The TLD knows a domain through its NS records — when you change domain registrar, the NS records are updated at the registrar.*

- **What is a zone transfer (AXFR)?**
  The mechanism secondary nameservers use to copy all zone data from the primary nameserver. Uses TCP 53.
  *Multiple nameservers are needed for redundancy. AXFR must be restricted — if everyone is allowed, an attacker can enumerate every subdomain.*

- **What is dig +trace for?**
  Bypasses the cache and recurses from the root itself. Shows each hop: Root → TLD → Authoritative → answer.
  *When you suspect a DNS propagation issue: +trace shows whether the authoritative server already has the new record, separately from the resolver's cache. A must-have debugging tool.*
