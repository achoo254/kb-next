---
title: Compression, static caching and rate limiting with nginx limit_req
tags: nginx, gzip, cache, limit_req, performance
type: lab
---

> [!TLDR]
> - `gzip` compresses text responses to save bandwidth; images and already-compressed files should not be compressed again.
> - Static files whose names carry a version can be cached by browsers for a long time with `expires` and `Cache-Control`.
> - `limit_req` limits requests per second per address, with `burst` to tolerate short spikes.

## Goal

After this article you configure nginx 1.24.x on Ubuntu 24.04 LTS to compress text responses, let browsers cache static files, and limit the request rate so one client cannot overload the application. It assumes you already have a `server` acting as a reverse proxy for the application.

## Preparation

- nginx is running a `server` for `app.example.com`.
- A static files directory, for example `/var/www/app/static/`, containing files such as `app.3f9c1.css` and `app.3f9c1.js`.
- Always check every change with `sudo nginx -t` before `sudo systemctl reload nginx`.

## Steps

### Step 1: turn on gzip compression

Place this in the `http` block (or in `server`):

```nginx
gzip on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_vary on;
gzip_proxied any;
gzip_types text/css application/javascript application/json image/svg+xml;
```

- `gzip on` enables compression. The `text/html` type is always compressed when gzip is on, so you need not list it.
- `gzip_types` lists additional MIME types to compress. List only text-like types; JPEG, PNG, video and zip files are already compressed, and compressing them again costs CPU for almost no size reduction.
- `gzip_comp_level` ranges from 1 to 9; higher levels compress smaller but use more CPU. Levels 4 to 6 are usually a good balance.
- `gzip_min_length` skips very small responses.
- `gzip_vary on` adds the `Vary: Accept-Encoding` header so intermediate caches tell compressed and uncompressed copies apart.
- `gzip_proxied any` allows compressing responses coming from an application behind the proxy (the default is `off`).

### Step 2: cache static files in the browser

```nginx
location /static/ {
    alias /var/www/app/static/;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

`expires 30d` sets the `Expires` header and a matching `Cache-Control: max-age` of 30 days. The safe approach is to cache for a long time only files whose names change when their content changes (like `app.3f9c1.css`), because the browser will not ask again for 30 days. If a file keeps its name while its content changes, users will see the old version. In nginx, an `add_header` at `location` level replaces the `add_header` directives inherited from the outer level, so if you set security headers at `server` level, repeat them here.

### Step 3: cache responses from the application (optional)

You can let nginx store the application's responses for a short time:

```nginx
# in the http block
proxy_cache_path /var/cache/nginx/app levels=1:2 keys_zone=appcache:10m max_size=1g inactive=60m;

# in location /
proxy_cache appcache;
proxy_cache_valid 200 10m;
add_header X-Cache-Status $upstream_cache_status;
```

Cache only pages that are identical for every user. Do not cache personalised pages or pages that require login, because one person could see another person's data. The `X-Cache-Status` header shows the result, such as `MISS`, `HIT` or `EXPIRED`, and many other values, which helps you verify.

### Step 4: rate limiting with limit_req

Declare the memory zone in the `http` block, then apply it in a `location`:

```nginx
limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;
limit_req_status 429;

location /api/ {
    limit_req zone=perip burst=20 nodelay;
    proxy_pass http://app_backend;
}
```

- `$binary_remote_addr` is the key: each client address has its own counter. The binary form is more compact than the string form, so the memory zone holds more addresses.
- `zone=perip:10m` sets the name and the size of the memory zone.
- `rate=10r/s` allows an average of 10 requests per second per address.
- `burst=20` allows a sudden spike of up to 20 requests above the rate; with `nodelay`, requests within the burst are processed immediately, whereas without `nodelay` they are queued and slowed to the allowed rate. By default the burst is 0.
- Requests over the limit are rejected. `limit_req_status 429` changes the returned code to 429 Too Many Requests; the default is 503.

Note: if nginx sits behind another proxy or a CDN, `$binary_remote_addr` is that proxy's address, and all users share one counter. In that case you must configure nginx to obtain the real client address (the realip module) before using per-address limits.

## Verification

```bash
curl -s -H "Accept-Encoding: gzip" -I -H "Host: app.example.com" http://127.0.0.1/static/app.3f9c1.css
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}\n" -H "Host: app.example.com" http://127.0.0.1/api/; done | sort | uniq -c
```

The first command should show `Content-Encoding: gzip` and the `Cache-Control` you set. The second sends 40 requests in a row: you will see some 200 codes and the rest 429 once you exceed the rate plus the burst. Look at `error.log` to see the lines where nginx records the rejections.

## Common errors

- **No compression**: the MIME type is not in `gzip_types`, the response is smaller than `gzip_min_length`, or the client does not send `Accept-Encoding: gzip`.
- **Users see an old file**: long caching while the file name does not change with the content.
- **All users are blocked at once**: nginx is behind another proxy so every request has the same source address.
- **The cache exposes personal data**: a user-dependent page was cached. Cache only shared content.
- **Security headers disappear in a `location`**: an `add_header` at the inner level completely replaces headers declared at the outer level.

## Summary

Compression reduces the amount of data to transfer, caching reduces the number of times work must be done, and `limit_req` protects the application from over-eager clients. All three are a few lines of configuration, but you should measure and verify with `curl` that they behave as intended before using them for real.

## References

- [Module ngx_http_gzip_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)
- [Module ngx_http_headers_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [Module ngx_http_limit_req_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
- [Module ngx_http_proxy_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
