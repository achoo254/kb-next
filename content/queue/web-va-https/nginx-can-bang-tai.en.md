---
title: Load balancing with nginx: upstream, balancing methods and passive health checks
tags: nginx, load balancing, upstream, high availability, ubuntu
type: lab
---

> [!TLDR]
> - An `upstream` block groups several machines running the same application; nginx shares requests among them, round robin by default.
> - Open-source nginx checks health passively: a machine that fails several times in a row is temporarily removed, measured by `max_fails` and `fail_timeout`.
> - You can change the method (`least_conn`, `ip_hash`), assign a `weight`, and mark a machine `backup`.

## Goal

This article helps you run two copies of an application at `127.0.0.1:3001` and `127.0.0.1:3002`, set up nginx 1.24.x on Ubuntu 24.04 LTS to share the load between them, and understand how nginx behaves when one copy stops responding. It continues from the basic reverse proxy, so you should already know `proxy_pass`.

## Preparation

- nginx is running with a `server` acting as a reverse proxy, as in the previous article of this planet.
- Two test application processes listening on ports 3001 and 3002. You can use `python3 -m http.server 3001 --bind 127.0.0.1` and `python3 -m http.server 3002 --bind 127.0.0.1` in two separate windows, each in a directory with an `index.html` of different content so they are easy to tell apart.

## Steps

### Step 1: declare the upstream

The `upstream` block goes in the `http` context (files in `sites-enabled` are already inside `http`, so put it in the same file, above `server`):

```nginx
upstream app_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

The only difference from a single-machine reverse proxy is that `proxy_pass` points to a group name instead of an address. Check the syntax, then reload: `sudo nginx -t && sudo systemctl reload nginx`.

By default nginx shares requests round robin: the first request goes to the first machine, the second to the second, then it starts over.

### Step 2: choose a method and weights

- `weight=n`: a machine with a higher weight receives proportionally more requests. Useful when one machine is stronger.
- `least_conn;`: picks the machine with the fewest active connections, suitable when the processing time of each request varies a lot.
- `ip_hash;`: the same client address always goes to the same machine, used when the application keeps sessions in each machine's memory. The better solution is to move sessions outside (for example into a database) so all machines are equivalent.
- `backup`: a standby machine that only receives requests when the others are unavailable.
- `down`: temporarily marks a machine as out of use, handy during maintenance.

```nginx
upstream app_backend {
    least_conn;
    server 127.0.0.1:3001 weight=2;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003 backup;
}
```

### Step 3: passive health checks

Open-source nginx does not actively probe machines on a schedule; it observes your real requests. Two parameters decide:

- `max_fails`: the number of consecutive unsuccessful attempts within `fail_timeout` after which the machine is considered unavailable. The default is 1.
- `fail_timeout`: both the period over which failures are counted and the time the machine is removed. The default is 10 seconds.

```nginx
upstream app_backend {
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
}
```

With this configuration, if a machine fails 3 times within 30 seconds, nginx stops sending requests to it for 30 seconds and then tries again.

What counts as "unsuccessful" is set by `proxy_next_upstream`. By default, connection errors, send or read errors and timeouts are counted, so a request that fails that way is retried at once on the next machine and users usually do not notice. In contrast, a 5xx status code that the application returns is not counted automatically unless you add it, for example `proxy_next_upstream error timeout http_502 http_503;`. Be careful with non-idempotent requests such as POST: by default nginx does not retry such a request on another machine once it has been sent to the previous one.

Active health checks (probing on a schedule) exist in the commercial NGINX Plus, or you can use another load balancer; this article only covers what is available in the open-source edition.

## Verification

```bash
for i in 1 2 3 4; do curl -s -H "Host: app.example.com" http://127.0.0.1/ | head -n 1; done
```

With two directories of different content, you will see the results alternate. To test a failure, stop one application (Ctrl+C in the window for port 3001) and run the loop again: every request is answered by the remaining machine, and now and then nginx retries the failed one after each `fail_timeout`. Look at `error.log` to see the `connect() failed` and `upstream server temporarily disabled` lines. Check the listening ports with `ss -ltn`, as described in [[Checking network connectivity on Ubuntu with ip, ss, ping and tracepath]].

## Common errors

- **Users get logged out randomly**: the application keeps sessions in each machine's memory without `ip_hash` or shared sessions.
- **All machines fail together, nginx returns 502**: nginx has no machine left to try. Look at `error.log`.
- **One machine receives too much load**: check `weight` and the method in use.
- **Forgot `reload`**: the new configuration only takes effect after reloading.
- **Used `down` and forgot to remove it**: maintenance is finished but the machine still receives no load.

## Summary

`upstream` turns several copies of an application into a single address for nginx. Round robin is the default, `least_conn` and `ip_hash` serve specific cases, and `max_fails` and `fail_timeout` temporarily remove a failing machine without outside tools. Once traffic is spread evenly, the next step is to reduce the load on each machine with compression and caching, and to block abuse with rate limiting: [[Compression, static caching and rate limiting with nginx limit_req]].

## References

- [Module ngx_http_upstream_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [Using nginx as HTTP load balancer (nginx.org)](https://nginx.org/en/docs/http/load_balancing.html)
- [Module ngx_http_proxy_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
