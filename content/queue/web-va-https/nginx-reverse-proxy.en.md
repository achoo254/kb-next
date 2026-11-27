---
title: nginx as a reverse proxy for an app: proxy_pass, X-Forwarded-* headers and timeouts
tags: nginx, reverse proxy, proxy_pass, http, ubuntu
type: lab
---

> [!TLDR]
> - A reverse proxy sits in front of an application, receives users' requests and forwards them to the application behind it.
> - `proxy_pass` points to the application; the `Host` and `X-Forwarded-*` headers tell the application what the original request looked like.
> - The three timeouts `proxy_connect_timeout`, `proxy_send_timeout` and `proxy_read_timeout` default to 60 seconds; raise them only when the application truly needs it.

## Goal

After this article you can set up nginx on Ubuntu 24.04 LTS (package `nginx` 1.24.x) in front of an application listening on `127.0.0.1:3000`, pass the real user address and protocol to the application, and adjust timeouts when the application answers slowly.

## What a reverse proxy is and why to use one

Web applications written in Node.js, Python or Go usually open their own HTTP port such as 3000 or 8080. You could expose that port straight to the Internet, but putting nginx in front has several benefits: a single port 80 for many applications (told apart by domain name), the application only needs to listen on `127.0.0.1` so it cannot be reached directly from outside, and nginx takes on heavy chores such as compression, caching and rate limiting (see [[Compression, static caching and rate limiting with nginx limit_req]]).

TLS certificates and HTTPS belong to another planet, so this article uses plain HTTP only.

## Preparation

- An Ubuntu 24.04 LTS machine with `sudo` access and nginx installed: `sudo apt install nginx`.
- A test application listening on `127.0.0.1:3000`. If you do not have one, run Python's static server for now: `python3 -m http.server 3000 --bind 127.0.0.1`.
- An example domain name: `app.example.com`.

On Ubuntu, nginx reads `/etc/nginx/nginx.conf`, which includes every file in `/etc/nginx/sites-enabled/`. The familiar convention is to write the file in `sites-available` and then create a symbolic link into `sites-enabled`.

## Steps

### Step 1: write the configuration file

Create the file `/etc/nginx/sites-available/app.example.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

What each part does:

- `proxy_pass http://127.0.0.1:3000;` is the destination nginx forwards requests to. When `proxy_pass` has no path after the address, nginx keeps the original request path. If you write `proxy_pass http://127.0.0.1:3000/api/;` the part matched by the `location` is replaced with `/api/`, so watch the trailing `/`.
- `Host`: by default nginx sends the application a `Host` equal to the `proxy_pass` target (here `127.0.0.1:3000`). If the application needs the domain name the user typed, set `Host $host`.
- `X-Real-IP` and `X-Forwarded-For`: the application only sees connections coming from nginx, that is `127.0.0.1`. These two headers carry the real user's address. `$proxy_add_x_forwarded_for` appends the client address to any existing `X-Forwarded-For` value, so the whole chain of proxies is preserved.
- `X-Forwarded-Proto`: tells the application whether the user used `http` or `https`, which helps when the application builds absolute URLs or redirects.

Security note: the application should only trust these headers when the request comes from an nginx you control. Users can send a fake `X-Forwarded-For` themselves, so configure the application to trust only the proxy at `127.0.0.1`.

### Step 2: enable the configuration and reload

```bash
sudo ln -s /etc/nginx/sites-available/app.example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` checks the syntax and only prints a result; it changes nothing on the running server. Only reload once it reports `syntax is ok` and `test is successful`. `reload` loads the new configuration without dropping existing connections. If you are not yet comfortable with `systemctl`, read [[systemctl on Ubuntu 24.04: enabling, disabling and restarting services and checking their status]].

### Step 3: adjust timeouts

Three timeouts affect the connection from nginx to the application, each 60 seconds by default:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_connect_timeout 5s;   # time to wait for the connection to be established
    proxy_send_timeout    60s;  # wait between two successive writes of data sent out
    proxy_read_timeout    60s;  # wait between two successive reads of data coming back
}
```

The last two do not measure the total time of the request; they measure the pause between two successive writes or reads. If the application takes longer than `proxy_read_timeout` without sending a single byte, nginx closes the connection and returns a 504 error to the user. When you see a 504, first find out why the application is slow; raise `proxy_read_timeout` only for a single `location` that really does heavy work (such as exporting a report), not globally.

### Step 4: WebSocket (if the application needs it)

For WebSocket, nginx must use HTTP/1.1 and pass the `Upgrade` and `Connection` headers:

```nginx
location /ws/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Verification

```bash
curl -I -H "Host: app.example.com" http://127.0.0.1/
sudo tail -n 5 /var/log/nginx/access.log
sudo tail -n 5 /var/log/nginx/error.log
```

The `curl` command simulates the domain name with a `Host` header, so you do not need to change DNS when testing on the same machine. If your application prints the headers it receives, you will see `X-Forwarded-For` carrying the client address. To check that the application really listens on port 3000, use `ss -ltn` as in [[Checking network connectivity on Ubuntu with ip, ss, ping and tracepath]].

## Common errors

- **502 Bad Gateway**: the application is not running or listens on the wrong port. Check with `ss -ltn`, then read `error.log` (usually a line such as `connect() failed ... Connection refused`).
- **504 Gateway Timeout**: the application answers too slowly compared with `proxy_read_timeout`.
- **The application always sees 127.0.0.1**: `X-Forwarded-For` was not set, or the application is not configured to read that header.
- **Paths shift when using `/api/`**: mind the trailing `/` in `proxy_pass` and in `location`.
- **Edited but nothing changed**: you forgot `reload`, or `nginx -t` reported an error so the new configuration was not loaded.

## Summary

A reverse proxy lets the application hide behind nginx. Three things to remember: `proxy_pass` to point the way, the `Host` and `X-Forwarded-*` headers so the application knows the original request, and the timeouts to handle slow applications. When you have several copies of the application, the next step is [[Load balancing with nginx: upstream, balancing methods and passive health checks]].

## References

- [Module ngx_http_proxy_module (nginx.org)](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Beginner's Guide (nginx.org)](https://nginx.org/en/docs/beginners_guide.html)
