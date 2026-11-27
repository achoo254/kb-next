---
title: Issuing and renewing Let's Encrypt certificates automatically with certbot and ACME on Ubuntu 24.04
tags: acme, certbot, let's encrypt, tls, ubuntu
type: lab
---

> [!TLDR]
> - ACME is a protocol that lets a machine prove control of a domain and receive a certificate; Let's Encrypt is a free CA that uses it, and certbot is a popular client.
> - Issue with a single `certbot` command, test with `--dry-run`, and let the renewal timer run on its own.
> - After every renewal, nginx must be reloaded to use the new certificate.

## Goal

After this article you will be able to issue a free TLS certificate from Let's Encrypt for a domain, understand how automatic renewal works, and check whether renewal is able to run. The background knowledge is the TLS handshake and the certificate chain (the first article of this series). Once you have a certificate, you can put nginx in front of your application as the TLS termination point, as described in [[nginx as a reverse proxy for an app: proxy_pass, X-Forwarded-* headers and timeouts]]. If you run into errors, continue with [[Common certificate errors and how to check them with openssl: expiry, missing intermediates, wrong hostname]].

## What ACME and Let's Encrypt are

ACME (Automatic Certificate Management Environment) is a protocol standardised in RFC 8555. The idea: your machine contacts the CA by itself, the CA issues a "challenge", and if the machine proves it controls the domain, the CA signs a certificate. The whole process needs no one to click a button.

Let's Encrypt is a non-profit CA that issues free certificates through ACME. Its certificates have a short lifetime (currently 90 days) to force renewal to be automated; it has also announced plans to shorten lifetimes further, so check the official site for the current figure. Two common kinds of challenge:

- **HTTP-01:** the CA calls port 80 of the domain to read a file that certbot has placed there. The easiest to use, but it cannot issue wildcard certificates.
- **DNS-01:** you prove control with a TXT record in DNS. It is required for wildcard certificates and works when the server does not open port 80, but you need a way to automate DNS changes.

This article uses HTTP-01.

## Preparation

- Ubuntu 24.04 LTS and `sudo` access.
- A real domain (the article uses `example.com` and `www.example.com` as examples; replace them with yours) with A/AAAA records pointing at this machine.
- nginx installed and serving that domain on port 80; the firewall allows ports 80 and 443.

The certbot instructions page recommends installing with snap on Ubuntu:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/certbot/current/bin/certbot /usr/bin/certbot
certbot --version
```

If you prefer apt, Ubuntu also has a `certbot` package in its own repository, but the version may be older; read the official instructions page to choose the approach that suits you.

## Steps

### 1. Try the staging environment first

Let's Encrypt has issuance limits, so do not experiment repeatedly against the real environment. Use `--dry-run` to run the whole flow without saving a real certificate, or `--test-cert` to obtain a test certificate (browsers will not trust it):

```bash
sudo certbot certonly --nginx -d example.com -d www.example.com --dry-run
```

### 2. Issue the real certificate

The simplest way is to let certbot edit the nginx configuration for you:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot asks for an email address for notifications (only to receive expiry warnings), accepts the terms, and then configures HTTPS. If you prefer to edit the configuration files yourself, use the obtain-only mode:

```bash
sudo certbot certonly --webroot -w /var/www/html -d example.com -d www.example.com
```

On success, the files are in `/etc/letsencrypt/live/example.com/`:

| File | Contents |
| --- | --- |
| `fullchain.pem` | the server certificate plus the intermediate certificates (use this for nginx) |
| `privkey.pem` | the private key (keep it secret, never share it) |
| `cert.pem` | the server certificate only |
| `chain.pem` | the intermediate certificates only |

In nginx the two lines you need are `ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;` and `ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;`. Use `fullchain.pem`, not `cert.pem`, otherwise the server will be missing the intermediate certificate.

### 3. Understand automatic renewal

The snap installation ships with a systemd timer. Look at it with:

```bash
systemctl list-timers | grep certbot
```

Certbot only really renews certificates with fewer than 30 days of validity left, so running it often does no harm. To see the state of your certificates:

```bash
sudo certbot certificates
```

### 4. Reload nginx after renewal

The new certificate is on disk, but nginx keeps the old one in memory until it is reloaded. The `--nginx` mode usually takes care of this, but with `certonly` mode you should add a deploy hook:

```bash
sudo certbot renew --deploy-hook "systemctl reload nginx"
```

Or place an executable script in `/etc/letsencrypt/renewal-hooks/deploy/`; certbot runs the scripts there after every successful renewal.

## Checking

1. Run the whole renewal flow without changing anything real:

   ```bash
   sudo certbot renew --dry-run
   ```

   The expected result is a message saying that all simulated renewals succeeded.
2. See the certificate the server is presenting:

   ```bash
   echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -dates -issuer
   ```

   The `notAfter` date must be far away and `issuer` is an intermediate CA of Let's Encrypt.

## Common errors

- **Domain validation fails:** the DNS records do not yet point at the machine, or port 80 is blocked by a firewall. Check both IPv4 and IPv6 if the domain has an AAAA record.
- **Hitting rate limits:** you tried too many times against the real environment. Use `--dry-run` or `--test-cert` when experimenting and read Let's Encrypt's rate-limit page.
- **Renewed, but the browser still sees the old certificate:** nginx has not been reloaded; add a deploy hook as above.
- **Renewal breaks silently after changing the nginx configuration or blocking port 80:** run `sudo certbot renew --dry-run` regularly, especially after every change to the web configuration.

Safety note: never put `privkey.pem` in a code repository, a screenshot or a chat channel. If you suspect the key has leaked, issue the certificate again with a new key and do not use `--reuse-key`.

## Summary

ACME turns requesting a certificate into something the machine does by itself, Let's Encrypt provides free certificates, and certbot connects the two to nginx. The habits worth keeping are issuing with `certbot`, testing with `--dry-run`, making sure the renewal timer is running and reloading nginx after each certificate change. The article is based on official documentation as of November 2026; compare it with the certbot and Let's Encrypt pages because details such as certificate lifetime may change.

## References

- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://datatracker.ietf.org/doc/html/rfc8555)
- [Let's Encrypt: documentation](https://letsencrypt.org/docs/)
- [Let's Encrypt: challenge types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt: rate limits](https://letsencrypt.org/docs/rate-limits/)
- [Certbot: installation instructions](https://certbot.eff.org/instructions)
- [Certbot: user guide](https://eff-certbot.readthedocs.io/en/stable/using.html)
