---
source: lab/tcp-udp
sourceHash: 2026-04-24T06:13:28.293Z
---
# TCP and UDP

Estimated time: 40 minutes. This lesson has an interactive playground: [Open the playground on Học Cloud](https://hoc-cloud.inetdev.io.vn/lab/tcp-udp).

## Quick summary

- **TCP — Transmission Control Protocol**
  - **Why:** [RFC 9293 §3.5](https://datatracker.ietf.org/doc/html/rfc9293#section-3.5) defines TCP's reliable delivery mechanism: every byte gets a sequence number; the receiver sends an ACK to acknowledge it; the sender retransmits when no ACK arrives within the RTO. Application code does not have to handle packet loss itself — TCP guarantees delivery and ordering. The cost: latency rises when retransmits happen, which makes it a poor fit for real-time media.
  - **When it breaks:** Using TCP for a real-time multiplayer game: retransmitting an old packet blocks newer packets → Head-of-Line blocking → uncontrollable lag spikes, especially when the network has >1% packet loss.
  - **In production:** Any service that needs data integrity: HTTP/HTTPS (nginx), databases (MySQL port 3306, Postgres 5432), SSH (port 22), file transfer. If losing 1 byte means corruption → use TCP.

- **UDP — User Datagram Protocol**
  - **Why:** [RFC 768](https://datatracker.ietf.org/doc/html/rfc768) defines UDP as a connectionless datagram protocol — no handshake, no ACK, no ordering. Each datagram is independent. Use it when the application can handle loss itself or when latency matters more than reliability: DNS queries, VoIP, game state updates, live streaming. How much the latency penalty of TCP retransmits affects a real-time application depends on the specific network conditions.
  - **When it breaks:** Using UDP for ordinary HTTP web traffic without a reliability layer (such as QUIC) → pages render incomplete or broken on a poor network, with no automatic retransmit mechanism.
  - **In production:** DNS (port 53), game servers (Unity/Unreal usually use UDP), video streaming (WebRTC), VoIP (SIP/RTP), monitoring (syslog UDP 514, SNMP UDP 161). Whenever latency matters more than completeness.

- **3-way Handshake: SYN → SYN-ACK → ACK**
  - **Why:** [RFC 9293 §3.3](https://datatracker.ietf.org/doc/html/rfc9293#section-3.3) defines the TCP 3-way handshake: SYN → SYN-ACK → ACK. The handshake confirms that both directions are reachable and synchronises the Initial Sequence Number (ISN) before any data is sent. Without a handshake → one side could send into the void when the network is asymmetric (outbound OK but inbound blocked).
  - **When it breaks:** SYN flood attack: the attacker sends thousands of fake SYNs, the server spends memory/CPU on half-open connections waiting for an ACK → the server cannot accept legitimate connections (DoS). Mitigation: SYN cookies.
  - **In production:** When debugging a slow connection: measure the handshake RTT with tcpdump timestamps. 3 RTT for the handshake + 1-2 RTT for TLS → baseline latency before any data flows = the reason you need a CDN/edge close to users.

- **Port 0–65535, well-known < 1024**
  - **Why:** [RFC 9293 §3.1](https://datatracker.ietf.org/doc/html/rfc9293#section-3.1) defines the TCP header with a 16-bit source port and a 16-bit destination port. Ports distinguish multiple services on the same IP address — the kernel uses the 4-tuple (src IP, src port, dst IP, dst port) to demultiplex packets to the right socket. Well-known ports (0–1023) require CAP\_NET\_BIND\_SERVICE on Linux — a security boundary, not a performance limit.
  - **When it breaks:** Binding a non-root service to a port < 1024: Permission denied. Binding a port already in use: Address already in use (TIME_WAIT has not expired or the service has not fully stopped). Both are common deployment errors.
  - **In production:** nginx in production: the master process runs as root to bind :80/:443, worker processes drop to www-data. Node.js in development usually uses :3000/:8080 (no root needed). Containers: map host port 80 → container port 3000.

- **TCP header 20–60 bytes vs UDP header 8 bytes**
  - **Why:** More overhead = more bandwidth used. For DNS (billions of queries per second), saving 12 bytes per packet = saving gigabytes per second of global network bandwidth.
  - **When it breaks:** Not directly tied to failures — but for an IoT device sending a 100-byte payload, the TCP header is 20% overhead. On expensive cellular networks, UDP saves a significant amount of bandwidth cost.
  - **In production:** Choosing a protocol for IoT sensors: MQTT over TCP (reliable, higher overhead) vs a custom UDP protocol (minimal overhead). When battery and data plan matter → UDP. When the data must arrive in full → TCP/MQTT.

- **HTTP/3 uses UDP (QUIC)**
  - **Why:** [RFC 9000](https://datatracker.ietf.org/doc/html/rfc9000) defines QUIC: a reliability layer built on UDP that solves TCP head-of-line blocking by isolating streams — a lost packet on stream A does not block stream B. [RFC 9114](https://datatracker.ietf.org/doc/html/rfc9114) defines HTTP/3 over QUIC. The speed benefit of HTTP/3 over HTTP/2 depends on network conditions — it is most pronounced when there is packet loss.
  - **When it breaks:** A corporate firewall blocks outbound UDP other than ports 53/123 → HTTP/3 is blocked → the browser falls back to HTTP/2 over TCP → no visible error, but performance is worse than expected.
  - **In production:** Cloudflare, nginx 1.25+ and Caddy support HTTP/3. Enable it by adding the Alt-Svc header. You must open UDP port 443 on the firewall/security group in addition to TCP 443. Verify with: curl --http3 https://yourdomain.com.

## Step 1 — Open a TCP listener with nc

Understand port binding in practice — nc creates a process listening on port 9000. With no process listening, a TCP SYN immediately gets an RST (connection refused). This is the foundation for debugging 'connection refused'.

[RFC 9293 §3.5.2](https://datatracker.ietf.org/doc/html/rfc9293#section-3.5.2) specifies that when a TCP SYN arrives at a closed port (no process listening), the kernel immediately sends an RST — this is 'Connection refused'. nc -l creates a listening socket on the specified port; without a listening socket, the SYN gets an RST instead of a SYN-ACK. Check which process is listening with ss -tlnp | grep PORT.

**When it breaks:** If you forget to start the server before connecting → Connection refused immediately. If the port is used by another process → Address already in use. These two errors account for >50% of junior developers' debugging questions.

```bash
# Terminal 1 — start the TCP server
nc -l 9000

# Terminal 2 — connect a TCP client
nc 127.0.0.1 9000
# Type any text → it appears in Terminal 1
# Ctrl+C to close
```

**Observe with:**

```bash
ss -tlnp | grep 9000  # See which process is listening on port 9000
sudo tcpdump -i lo -n 'port 9000' -v  # Capture packets on loopback while connecting
```

## Step 2 — Capture the 3-way handshake with tcpdump

TCP only transfers data after the 3-way handshake completes: the client sends SYN, the server answers with SYN-ACK, and the client confirms with ACK. Capturing packets on loopback with `sudo tcpdump -i lo -n 'port 9000' -v` shows exactly these three packets every time `nc` connects to the server. Reading the Flags column helps you tell a successful connection apart from one that got an RST or had its packets dropped.

[RFC 9293 §3.1](https://datatracker.ietf.org/doc/html/rfc9293#section-3.1) defines the TCP control bits in the header: SYN (bit 1), ACK (bit 4), FIN (bit 0), RST (bit 2). tcpdump uses the notation: \[S\]=SYN, \[S.\]=SYN-ACK (SYN+ACK), \[.\]=ACK, \[F.\]=FIN-ACK, \[R\]=RST. The 3-way handshake you observe is \[S\] → \[S.\] → \[.\] — only after that does data transfer start.

**When it breaks:** If you only see SYN and no SYN-ACK → a firewall, or the server is not listening. If you see SYN + RST → the port is closed. If you see nothing → the packet is being dropped (firewall DROP). Telling these 3 patterns apart is a core network debugging skill.

```bash
# Terminal 1 — capture on loopback
sudo tcpdump -i lo -n 'port 9000' -v

# Terminal 2 — start the server
nc -l 9000

# Terminal 3 — connect to see the handshake
nc 127.0.0.1 9000
# tcpdump shows: SYN → SYN-ACK → ACK
```

**Observe with:**

```bash
sudo tcpdump -i lo -n 'port 9000' -v  # Flag: [S]=SYN, [S.]=SYN-ACK, [.]=ACK, [R]=RST
# Reading the output: client:port > server:port Flags [S], seq N
```

## Step 3 — Try UDP — no handshake

UDP is a connectionless protocol: there is no handshake, and the very first datagram already carries data. With `nc -u`, text typed on the client appears on the server immediately, with no handshake first. Because there is no connection state, sending UDP to a port that is not open (for example 9001) does not report an error on the sending side either — completely unlike TCP, which is refused immediately.

**When it breaks:** Sending UDP when no server is listening → no error on the sending side (unlike TCP, which is refused immediately). The destination kernel sends ICMP Port Unreachable — but if a firewall blocks ICMP, the sender learns nothing. Debugging UDP failures is harder than TCP because there is no connection state.

```bash
# Terminal 1 — UDP server
nc -u -l 9000

# Terminal 2 — UDP client (no handshake)
nc -u 127.0.0.1 9000
# Type text → it appears in Terminal 1 immediately, no handshake needed first

# Compare: send UDP when there is no server
nc -u 127.0.0.1 9001  # port not open
echo 'hello' | nc -u 127.0.0.1 9001  # sends without reporting an error
```

**Observe with:**

```bash
sudo tcpdump -i lo -n 'port 9001' -v  # See UDP datagrams without handshake flags
ss -ulnp  # Check which UDP sockets are listening
```

**Symptoms when it breaks:**

- The UDP client sends data but the server receives nothing — no error at all on the client: sudo tcpdump -i lo -n 'port 9001' shows UDP packets going out but no packets coming back. The server side prints nothing. No error message on the client — this is UDP's best-effort behavior by design
- UDP sends without errors but the server log is missing messages: Count messages sent vs received: the client sends 1000 packets, the server log only shows 950 — 50 packets were dropped silently (5% packet loss). Detect it with an application-level sequence counter; UDP does not report it on its own

**How to fix:**

1. Use tcpdump to confirm whether the UDP packets are actually being sent

   ```bash
   sudo tcpdump -i lo -n 'udp port 9001' -c 5
   ```
2. If you need a delivery guarantee with UDP, implement sequence numbers at the application layer

   ```bash
   # No OS command — this is logic you must implement in application code
   ```

## Step 4 — Compare TCP vs UDP with Wireshark / tcpdump

Wireshark shows the RTTs exactly: with TCP, the first 3 packets are the handshake before any data. With UDP, data appears in the very first packet. This is direct evidence of the latency trade-off.

**When it breaks:** If you capture only one side and see no ACK → the network is asymmetric (packets in one direction are blocked). Common when debugging cloud VMs: inbound OK but outbound blocked by a security group → the SYN goes out but no SYN-ACK comes back.

```bash
# Capture TCP and UDP at the same time
sudo tcpdump -i lo -n 'port 9000 or port 9001'

# Open 2 server/client pairs (TCP port 9000, UDP port 9001)
# TCP: nc -l 9000  /  nc 127.0.0.1 9000
# UDP: nc -u -l 9001  /  nc -u 127.0.0.1 9001

# Observe: TCP starts with 3 lines SYN/SYN-ACK/ACK
# UDP starts directly with a data packet
```

**Observe with:**

```bash
sudo tcpdump -i lo -n 'port 9000 or port 9001'  # Compare side by side
# TCP: see [S] [S.] [.] before data | UDP: see the data packet first, immediately
```

## Step 5 — Check listening ports — tell TCP from UDP

ss/netstat distinguish tcp from udp in their output. When debugging 'connection refused', the first step is to check which process is listening on which port, and with which protocol.

**When it breaks:** The service runs on UDP but the client connects over TCP → refused immediately. This happens with misconfiguration: a DNS server (UDP 53) tested with nc (TCP by default) → refused, yet DNS is still working. Check the right protocol before concluding the service is down.

```bash
# Show all listening ports (both TCP and UDP)
ss -tlunp

# TCP only
ss -tlnp | grep LISTEN

# UDP only
ss -ulnp

# Show which process binds a specific port
sudo ss -tlnp | grep ':80'
```

**Observe with:**

```bash
ss -tlunp  # t=TCP, u=UDP, l=listening, n=numeric, p=process
# The output clearly distinguishes 'tcp' vs 'udp' in the first column
```

## Step 6 — DNS query over UDP — see why TCP is not needed

DNS is the most classic example of UDP: the query and response fit into 1 packet &lt;512 bytes. Use dig with +tcp to compare latency — TCP clearly adds handshake overhead.

[RFC 1035 §2.3.4](https://datatracker.ietf.org/doc/html/rfc1035#section-2.3.4) defines the 512-byte limit for DNS messages over UDP — the reason DNS is the most classic example of UDP: the query and response usually fit in 1 small datagram, so the overhead of the TCP 3-way handshake outweighs the benefit. DNS falls back to TCP when the response exceeds 512 bytes (or EDNS0 extends the limit to 4096 bytes per RFC 6891).

**When it breaks:** A firewall blocks outbound UDP 53 → every DNS query times out → every service that depends on domain resolution fails. Sign: ping by IP works but ping by hostname times out. Verify: if dig @8.8.8.8 google.com gets no answer → the firewall is blocking UDP 53.

```bash
# DNS queries use UDP by default
dig google.com

# Force DNS over TCP to compare
dig +tcp google.com

# Capture the DNS query (UDP port 53)
sudo tcpdump -i any -n 'port 53' &
dig google.com
sudo pkill tcpdump
# You see: 1 query packet + 1 response packet (UDP, no handshake)
```

**Observe with:**

```bash
sudo tcpdump -i any -n 'port 53'  # Capture DNS: see UDP vs TCP handshake
dig google.com  # Default UDP
dig +tcp google.com  # Force TCP — count the extra packets
```

## Step 7 — TCP FIN handshake — closing a connection properly

Closing a TCP connection is its own exchange too: each direction sends a FIN and gets it ACKed — the connection is not simply cut off. The side that actively closes keeps the socket in the TIME_WAIT state for a while longer, so `ss -tn` still shows the entry even though the connection has ended. Understanding TIME_WAIT explains the 'Address already in use' error when you restart a service right away, and why you should reuse connections with keepalive/connection pools.

**When it breaks:** Restarting a service right after stopping it → 'Address already in use' because the port is still in TIME_WAIT. Fix: SO_REUSEADDR (most production servers already set it). If you see too many TIME_WAIT sockets → connections may not be reused (missing keepalive/connection pool).

```bash
# Show TCP states when a connection closes
ss -tn

# Show TIME_WAIT (appears right after a connection closes)
ss -tn | grep TIME-WAIT

# Fix 'Address already in use' during development: SO_REUSEADDR
# (nginx and node.js both set this flag by default)
```

**Observe with:**

```bash
ss -tn state time-wait  # Show connections in TIME_WAIT
watch -n1 'ss -tn | grep TIME-WAIT | wc -l'  # Count in real time while opening/closing connections
```

**Symptoms when it breaks:**

- The server receives no new connections even though it is running — the client reports 'cannot assign requested address': ss -tn | grep TIME-WAIT | wc -l returns tens of thousands (>28000 on the default ephemeral range 32768-60999). The client kernel cannot find a free ephemeral port to open a new connection
- Restarting nginx/node right after stopping it → 'bind: Address already in use': ss -tn | grep ':80.*TIME-WAIT' or ss -tlnp | grep ':80' shows no LISTEN, yet the port is still occupied. The kernel keeps the socket in TIME_WAIT for ~60s (2×MSL, RFC 793)

**How to fix:**

1. Check the current number of TIME_WAIT sockets

   ```bash
   ss -tn state time-wait | wc -l
   ```
2. Show the kernel's ephemeral port range

   ```bash
   cat /proc/sys/net/ipv4/ip_local_port_range
   ```
3. Widen the ephemeral port range to get more ports (a temporary measure; tuning keepalive/pooling is the real solution)

   ```bash
   sudo sysctl -w net.ipv4.ip_local_port_range='1024 65535'
   ```
4. Enable tcp_tw_reuse to reuse TIME_WAIT sockets for outbound connections (safe when timestamps are enabled)

   ```bash
   sudo sysctl -w net.ipv4.tcp_tw_reuse=1
   ```

**Scripted:** Run on a production server when you suspect TIME_WAIT exhaustion or a connection pool leak. Output: timestamp + count of each TCP state (ESTAB, TIME-WAIT, CLOSE-WAIT...). Default interval is 2s; pass an argument to change it: ./watch-tcp-states.sh 5

```bash
#!/bin/bash
# watch-tcp-states.sh — Monitor TCP state counts in real time
# Use when debugging TIME_WAIT exhaustion or tracking a connection leak
INTERVAL=${1:-2}
echo "Monitoring TCP states every ${INTERVAL}s (Ctrl+C to stop)"
echo "---"
while true; do
  echo "$(date '+%H:%M:%S')  $(ss -tn | awk 'NR>1{print $1}' | sort | uniq -c | sort -rn | tr '\n' '  ')"
  sleep "$INTERVAL"
done
```

## Common misconceptions

- **Wrong:** TCP retransmits immediately when it detects packet loss
  **Right:** TCP uses an RTO (Retransmission Timeout) computed from the RTT with the Jacobson/Karels algorithm per [RFC 6298 §2](https://datatracker.ietf.org/doc/html/rfc6298#section-2); the minimum value is 1 second per RFC 6298 §2.4. Retransmission is not immediate — this is the origin of TCP head-of-line blocking in HTTP/1.1.

Understanding the latency penalty of TCP retransmits correctly lets you pick the right protocol: video calls use UDP because losing 1 frame is better than waiting 1+ seconds for a retransmit that causes a freeze. QUIC solves this by isolating retransmits at the stream level.

- **Wrong:** UDP is unreliable = it cannot be used for important applications
  **Right:** A reliability layer can be built on UDP at the application level — QUIC ([RFC 9000](https://datatracker.ietf.org/doc/html/rfc9000)) is an example: sequence numbers, ACKs and per-stream retransmits on top of UDP. WebRTC also uses UDP with application-level reliability for media.

Binary thinking of TCP=reliable/UDP=unreliable leads to misunderstanding the QUIC/WebRTC architecture. HTTP/3 uses UDP yet is more reliable than HTTP/2-over-TCP on lossy networks because it has no transport-level HOL blocking.

- **Wrong:** TIME_WAIT is a bug that should be switched off with sysctl
  **Right:** [RFC 9293 §3.3.2](https://datatracker.ietf.org/doc/html/rfc9293#section-3.3.2) specifies a TIME\_WAIT duration = 2×MSL (Maximum Segment Lifetime) to ensure that delayed duplicate packets from an old connection do not corrupt a new connection using the same 4-tuple. Disabling TIME\_WAIT = risk of data corruption. SO\_REUSEADDR is the correct way to bypass it during local development.

sysctl tcp_tw_recycle (removed from the Linux kernel in 4.12) caused real production bugs with NAT — connections from the same NAT gateway were dropped because of unsynchronised timestamps. Do not disable TIME_WAIT in production.

- **Wrong:** Ports below 1024 are restricted for performance reasons
  **Right:** Well-known ports (0–1023) require CAP_NET_BIND_SERVICE (Linux) or root because they are a security boundary — only privileged processes may claim important ports, which prevents user-space processes from impersonating SSH (22) or HTTP (80). It has nothing to do with performance.

Configuring a container/systemd service to bind port 80/443 without running as root: use setcap cap_net_bind_service=+ep on the binary, or authbind. Understanding the real reason helps you configure the right capabilities instead of escalating privileges unnecessarily.

- **Wrong:** A SYN flood attack exhausts the server's RAM because each half-open connection uses a lot of memory
  **Right:** A SYN flood exhausts the backlog queue (net.ipv4.tcp\_max\_syn\_backlog) rather than RAM — a half-open connection (SYN\_RCVD) uses relatively little memory. SYN cookies ([RFC 4987](https://datatracker.ietf.org/doc/html/rfc4987)) solve this by encoding the state into the ISN, so no per-connection state needs to be stored for half-open connections.

The mitigation strategy depends on identifying the root cause correctly: if you think it is RAM → adding RAM will not solve it; you must enable SYN cookies (net.ipv4.tcp_syncookies=1) and enlarge the backlog queue to absorb bursts.

## Try at home

**1.** See the 3-way handshake — SYN/SYN-ACK/ACK — with your own eyes before any data flows

```bash
# Terminal 1: start TCP server
nc -l 9000

# Terminal 2: capture
sudo tcpdump -i lo -n 'port 9000' -v

# Terminal 3: connect
nc 127.0.0.1 9000
```

**Observe:** # In the tcpdump output, look at the flags:
# [S] = SYN (client requests a connection)
# [S.] = SYN-ACK (server agrees)
# [.] = ACK (client acknowledges)
# Counting these 3 lines = the 3-way handshake completes before the first data

**2.** See that UDP has no handshake — data goes straight out without any handshake

```bash
# Terminal 1: UDP server
nc -u -l 9001

# Terminal 2: capture
sudo tcpdump -i lo -n 'port 9001' -v

# Terminal 3: UDP client
nc -u 127.0.0.1 9001
```

**Observe:** # In tcpdump: the very first packet is DATA
# No [S] [S.] [.] at all — this is evidence that UDP is fire-and-forget
ss -ulnp | grep 9001  # Verify the UDP server is listening

**3.** See that DNS uses UDP (port 53) — query + response are just 2 packets, no handshake

```bash
sudo tcpdump -i any -n 'port 53' &
dig google.com
sudo pkill tcpdump
# Compare: dig +tcp google.com (force TCP, you see a SYN first)
```

**Observe:** # UDP DNS: only 2 lines in tcpdump (query + response)
# TCP DNS: 3 extra handshake lines before the 2 data lines
dig +stats google.com  # Look at 'SERVER:' and 'Query time:' to compare latency

**4.** Check listening ports to tell TCP from UDP — a basic debugging skill

```bash
# Show all TCP ports in LISTEN
ss -tlnp

# Show all UDP sockets
ss -ulnp

# Show which process binds a specific port
sudo ss -tlnp | grep ':80'
```

**Observe:** # First column: 'tcp' or 'udp' — this is how you tell them apart
# The 'LISTEN' state exists only for TCP; UDP has no LISTEN state
# The 'Local Address:Port' column shows the IP and port being bound

**5.** Reproduce 'connection refused' vs 'connection timeout' — the 2 most common errors

```bash
# Connection refused: no process listening on the port
nc -vz 127.0.0.1 65533

# Connection timeout: IP does not exist or firewall drops
nc -vz -w 3 203.0.113.254 80

# Observe the response time: refused immediately, timeout after 3s
```

**Observe:** # Refused: answers immediately in <10ms — the kernel sends an RST
# Timeout: waits the full -w seconds — the SYN is dropped/firewalled
time nc -vz 127.0.0.1 65533  # Measure the refused time
time nc -vz -w 2 203.0.113.254 80  # Measure the timeout time

**6.** Look at TCP states on the system — understand ESTABLISHED, TIME_WAIT, LISTEN

```bash
# Show all TCP connections with their state
ss -tn

# Filter by state
ss -tn state established
ss -tn state time-wait

# Watch in real time while opening/closing connections
watch -n1 'ss -tn | head -20'
```

**Observe:** # After closing the nc connection: watch TIME-WAIT appear
# ss -tn | grep TIME-WAIT — it lasts ~60s before disappearing
# This is exactly what causes 'Address already in use' on a quick restart

## Review questions

**Question 1.** Why does DNS use UDP instead of TCP?

1. UDP is more secure than TCP
2. DNS queries are small and need to be fast — avoiding the 3-way handshake overhead
3. TCP does not support port 53
4. UDP guarantees delivery better than TCP

**Answer:** DNS queries are small and need to be fast — avoiding the 3-way handshake overhead. A DNS query is usually &lt;512 bytes and needs an answer within a few ms. With TCP, 3 handshake packets would be spent before every query — nearly doubling latency. At billions of queries per second, saving the handshake = enormous savings.

- **UDP is more secure than TCP**: UDP is not more secure than TCP. If you need secure DNS, use DNS-over-TLS (DoT) or DNS-over-HTTPS (DoH), both of which run over TCP/HTTPS.

- **TCP does not support port 53**: TCP fully supports port 53. DNS over TCP (used for zone transfers and responses &gt;512 bytes) still uses port 53.

- **UDP guarantees delivery better than TCP**: The opposite — UDP does not guarantee delivery. TCP does. UDP is chosen for speed, not reliability.

**Question 2.** In what order does the TCP 3-way handshake happen?

1. SYN-ACK → SYN → ACK
2. ACK → SYN → SYN-ACK
3. SYN → SYN-ACK → ACK
4. SYN → ACK → DATA

**Answer:** SYN → SYN-ACK → ACK. The client sends SYN (requests a connection). The server replies with SYN-ACK (agrees + requests in the reverse direction). The client sends ACK (acknowledges). This order ensures both directions work before any data flows.

- **SYN-ACK → SYN → ACK**: SYN-ACK cannot be the first step because the server does not know who wants to connect until it receives a SYN.

- **ACK → SYN → SYN-ACK**: A leading ACK makes no sense — an ACK is an acknowledgement, but there is nothing to acknowledge yet.

- **SYN → ACK → DATA**: After SYN and ACK, the SYN-ACK from the server is still missing — the server has not agreed to the connection.

**Question 3.** A 'Connection refused' error appears when you curl a server. What is the most likely cause?

1. A firewall is blocking packets
2. DNS cannot resolve the hostname
3. No process is listening on that port
4. The network cable is cut

**Answer:** No process is listening on that port. 'Connection refused' = the TCP SYN reached the destination machine but the kernel sent an RST because no process is listening on that port. It means the machine is up and IP routing is fine, but the service is not running (or is running on the wrong port).

- **A firewall is blocking packets**: A firewall that DROPs packets produces 'connection timeout' (the SYN is swallowed), not 'refused'. A firewall that REJECTs produces ICMP unreachable, not a TCP RST.

- **DNS cannot resolve the hostname**: If DNS fails, curl reports 'Could not resolve host', not 'Connection refused'. DNS happens before the TCP connect.

- **The network cable is cut**: Cut cable → link down → no route → timeout or 'no route to host'. The packet never reaches the destination.

**Question 4.** HTTP/3 uses UDP instead of TCP — why not use TCP like HTTP/1 and HTTP/2?

1. UDP is faster and HTTP/3 does not need reliability
2. TCP has Head-of-Line blocking — losing 1 packet blocks the whole connection
3. IANA recommends UDP for HTTPS
4. TCP does not support port 443

**Answer:** TCP has Head-of-Line blocking — losing 1 packet blocks the whole connection. HTTP/2 multiplexes many streams over 1 TCP connection. When 1 TCP packet is lost, the whole connection must wait for the retransmit — even unrelated streams are blocked (Head-of-Line blocking). QUIC over UDP handles each stream independently.

- **UDP is faster and HTTP/3 does not need reliability**: HTTP/3 still needs reliability — QUIC implements reliability itself at the application layer; it does not drop reliability. It just does not use TCP to provide it.

- **IANA recommends UDP for HTTPS**: IANA does not recommend UDP for HTTPS. This was Google's decision (QUIC), which the IETF later standardised as HTTP/3.

- **TCP does not support port 443**: TCP fully supports port 443. HTTP/1.1 and HTTP/2 still use TCP:443 today.

**Question 5.** Well-known ports (0–1023) require root to bind — why?

1. To improve network performance
2. To protect against ordinary users impersonating system services (SSH, HTTP)
3. Because low port numbers need dedicated kernel memory
4. IANA mandates that only the kernel may use them

**Answer:** To protect against ordinary users impersonating system services (SSH, HTTP). If any user could bind :22, they could create a fake SSH server — and harvest credentials. Only a root process can be trusted to run the real SSH. That is why nginx in production runs as root and then drops privileges after binding :80/:443.

- **To improve network performance**: Port numbers do not affect network performance. Packet routing does not care whether a port is low or high.

- **Because low port numbers need dedicated kernel memory**: The kernel does not use dedicated memory for low ports. A port is just a 16-bit number in the header.

- **IANA mandates that only the kernel may use them**: IANA assigns service names to ports but does not control OS policy. Requiring root is a decision of the OS kernel (Linux, BSD, Windows).

**Question 6.** You are debugging a multiplayer game with high lag. The developer says 'the server uses TCP'. What could the problem be?

1. TCP does not support many concurrent connections
2. TCP retransmits when packets are lost — this increases latency uncontrollably in a game
3. Games cannot use TCP, only UDP
4. The TCP header is too large and causes congestion

**Answer:** TCP retransmits when packets are lost — this increases latency uncontrollably in a game. In a game, every old position frame is worthless once a new frame arrives. TCP retransmitting an old packet delays every new packet after it (Head-of-Line blocking). Games should use UDP and handle loss themselves — skip old frames and care only about the latest one.

- **TCP does not support many concurrent connections**: TCP supports thousands of concurrent connections. A multiplayer server using TCP still works fine in terms of connection count.

- **Games cannot use TCP, only UDP**: Games can use TCP — many real mobile games use TCP for casual gaming. The problem is latency, not compatibility.

- **The TCP header is too large and causes congestion**: A 20-60 byte TCP header is not large enough to cause congestion. Latency comes mainly from the retransmit logic, not header size.

**Question 7.** What happens when you send a UDP packet to a port with no process listening?

1. The packet is dropped silently, with no response at all
2. The connection times out after 30 seconds
3. An ICMP Port Unreachable is sent back
4. The OS automatically redirects to another port

**Answer:** An ICMP Port Unreachable is sent back. When a UDP packet arrives at a port that is not listening, the kernel sends ICMP Type 3 Code 3 (Port Unreachable) back to the sender. This is why 'nc -u 127.0.0.1 [closed-port]' usually gets an ICMP error immediately — unlike a TCP RST.

- **The packet is dropped silently, with no response at all**: It is not always silent — the kernel sends back ICMP Port Unreachable. However, a firewall may block ICMP, so the sender gets no response.

- **The connection times out after 30 seconds**: UDP has no built-in timeout. A 30s timeout is application behavior, not kernel/protocol behavior.

- **The OS automatically redirects to another port**: The OS does not redirect ports — that is the job of an application proxy or a NAT rule.

**Question 8.** What is the sequence number in TCP used for?

1. Identifying the connection (instead of the IP)
2. Guaranteeing order and detecting packet loss for retransmission
3. Encrypting data
4. Counting bytes sent to compute bandwidth

**Answer:** Guaranteeing order and detecting packet loss for retransmission. The sequence number numbers every byte. The receiver knows which packets are missing (it ACKs the last contiguously received packet). When the network reorders packets, the receiver uses the seq number to put them back in the correct order. This is the core mechanism that makes TCP reliable.

- **Identifying the connection (instead of the IP)**: A connection is identified by the 4-tuple: src IP, src port, dst IP, dst port. The sequence number is not used for this.

- **Encrypting data**: The sequence number encrypts nothing. Encryption happens in TLS (L5/L6), unrelated to the TCP header.

- **Counting bytes sent to compute bandwidth**: The sequence number is a byte offset, not a counter for measuring bandwidth. Throughput is computed from ACK timing, not directly from the seq number.

## Flashcards

- **What is TCP and when should you use it?**
  Transmission Control Protocol — acknowledged connections, guaranteed ordering and delivery. Used for the web (HTTP/S), SSH, databases, email — whenever losing 1 byte breaks things.
  *If you don't know when to use TCP, your service design will be wrong from the start — like using UDP for database queries.*

- **What is UDP and when should you use it?**
  User Datagram Protocol — sends without acknowledgement, no ordering guarantee. Used for DNS, VoIP, video streaming, online games — when latency matters more than losing a few bytes.
  *Misusing UDP (for the web) makes pages render wrong/incomplete. Misusing TCP (for games) causes lag from retransmits.*

- **What does the TCP 3-way handshake consist of?**
  1. Client → Server: SYN (seq=X)
2. Server → Client: SYN-ACK (seq=Y, ack=X+1)
3. Client → Server: ACK (ack=Y+1)
Then data starts flowing.
  *These 3 steps ensure both directions, client→server and server→client, are open before real data is sent. With only 1 step (SYN+DATA), the server might receive data while the client has no idea whether the server received it.*

- **How do Connection refused and Connection timeout differ?**
  Refused: the SYN reaches the destination, the kernel returns a TCP RST — the machine is up but no process is listening on that port.
Timeout: the SYN never gets an ACK — firewall drop, machine off, or wrong route.
  *Telling these 2 errors apart points your debugging in the right direction: refused → check whether the service is running; timeout → check firewall/network/IP.*

- **What are well-known ports? Why is root needed?**
  Ports 0–1023, assigned by IANA to well-known services (22=SSH, 53=DNS, 80=HTTP, 443=HTTPS). Root is needed to bind them to protect against ordinary users impersonating system services.
  *Without the root requirement, any user could create a fake SSH server on :22 to harvest passwords — this is why the restriction exists.*

- **Why does HTTP/3 use UDP?**
  HTTP/2 over TCP suffers from Head-of-Line blocking: losing 1 TCP packet → blocks the whole connection even with many streams. QUIC (HTTP/3) over UDP handles each stream independently — losing 1 stream does not affect the others.
  *Understanding this explains why HTTP/3 is faster than HTTP/2 on poor networks (mobile, weak Wi-Fi) — environments where packet loss is common.*

- **What does the sequence number do in TCP?**
  It numbers every byte of data. The receiver ACKs the last contiguously received byte. The sender retransmits if it gets no ACK. It is used to reorder packets that arrive out of order.
  *This is the core mechanism that makes TCP reliable — without seq numbers you cannot tell which packets were lost, and you cannot reorder.*

- **What is the TIME_WAIT state in TCP?**
  After a connection closes, the socket stays in TIME_WAIT for ~60s. The kernel waits to make sure no stray old packets arrive late.
  *Understanding TIME_WAIT helps you debug 'Address already in use' when restarting a server — use SO_REUSEADDR to bypass it. Without that understanding, you waste time waiting unnecessarily.*

- **What is the TCP window size?**
  The number of bytes the sender may send before it needs an ACK. Larger window size = higher throughput. The receiver advertises its window size to control the flow (flow control).
  *High bandwidth but high latency (satellite) → TCP is slow because the window size limits throughput. This is why long-fat networks need TCP tuning (tcp_rmem/tcp_wmem).*

- **What does the UDP checksum protect?**
  The 8-byte UDP header consists of src port, dst port, length and checksum. The checksum detects corruption in transit — but does not retransmit. The app decides for itself whether to ignore it or handle it.
  *UDP is not entirely irresponsible — it still has a checksum. The difference: a corrupt packet is dropped without retransmission, and the app must retry itself if needed.*

- **How do nc -l 9000 and nc -u -l 9000 differ?**
  nc -l 9000: TCP server, the client must handshake before sending.
nc -u -l 9000: UDP server, receives datagrams directly with no handshake.
  *Knowing the -u flag matters when testing services. Using nc to debug quickly without writing code is a minimum skill for a sysadmin/DevOps engineer.*

- **Port ranges: well-known, registered, ephemeral?**
  0–1023: well-known (IANA, root required)
1024–49151: registered (ordinary applications, no root required)
49152–65535: ephemeral (assigned by the OS for client connections)
  *When debugging with netstat/ss, seeing a client port >49152 is normal — it is an ephemeral port assigned by the OS. No need to worry about high port numbers on the client side.*
