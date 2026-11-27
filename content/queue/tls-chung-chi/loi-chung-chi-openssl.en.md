---
title: Common certificate errors and how to check them with openssl: expiry, missing intermediates, wrong hostname
tags: openssl, tls, certificates, troubleshooting, ubuntu
type: lab
---

> [!TLDR]
> - The three most common certificate errors are expiry, a missing intermediate certificate and a hostname mismatch.
> - `openssl s_client` shows the verification error code; `openssl x509` shows the expiry date and the certificate's list of names (SAN).
> - Check from the client using the exact domain, with SNI, and only then fix the server.

## Goal

This article helps you recognise three common certificate errors, read `openssl`'s messages and know where to fix them. You should already know the certificate-chain concept and how certificates are issued and renewed (the two previous articles in the series).

## Preparation

- Ubuntu 24.04 LTS with OpenSSL 3.0.13 (check with `openssl version`). The options below were tried on that version; see `openssl s_client -help` if your machine differs.
- A domain to check. The article uses `example.com` as an example; replace it with your own domain.
- The commands are read-only and change nothing on the server.

## Core tools

Two commands you will use constantly:

```bash
# Connect and see the verification result. -servername sends SNI, required when one IP serves many names.
echo | openssl s_client -connect example.com:443 -servername example.com -verify_hostname example.com

# Read the details of a certificate in a PEM file
openssl x509 -in cert.pem -noout -subject -issuer -dates -ext subjectAltName
```

`echo |` closes the input so `s_client` exits at once instead of waiting for you to type. At the end of `s_client`'s output, the line `Verify return code: 0 (ok)` means the chain is valid; a non-zero number with an explanation is an error. With `-verify_hostname` you also see a line `Verification: OK` or `Verification error: ...`.

To fetch the server certificate and read it straight away:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

## Error 1: the certificate has expired

**Symptoms:** the browser says "certificate has expired"; `s_client` reports an error code related to the validity period (in OpenSSL it reads `certificate has expired`).

**Check:**

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -dates
```

Look at the `notAfter` line. To find out whether the certificate expires within the next N seconds, use `-checkend`:

```bash
openssl x509 -in cert.pem -noout -checkend 1209600   # 14 days
```

The command prints `Certificate will not expire` and exits with code 0 if it is still valid, or `Certificate will expire` and code 1 if it is about to expire. This is very handy in a monitoring script.

**Fix:** renew the certificate, then reload the web service. A common cause is that the renewal timer is not running, or the new certificate is on disk but nginx has not been reloaded.

Note: a skewed system clock causes similar errors. If the client's clock is wrong, a valid certificate can still be treated as not yet valid or as expired.

## Error 2: the intermediate certificate is missing

**Symptoms:** some clients (especially `curl`, libraries inside applications and the Java virtual machine) refuse the connection, while a few browsers still open the site because they fetch the missing intermediate certificate themselves. `openssl s_client` reports:

```
verify error:num=20:unable to get local issuer certificate
verify error:num=21:unable to verify the first certificate
Verify return code: 21 (unable to verify the first certificate)
```

**Check:** list the certificates the server actually sends:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null | grep -E "^ *[0-9]+ s:|^ *i:"
```

Each certificate is printed with an `s:` (subject) line and an `i:` (issuer) line. If there is only one certificate (entry `0`) and its issuer is not a trusted root, the server forgot to send the intermediate certificate.

The error codes 20 and 21 above also appear when the client simply does not trust the issuer (for example a self-made CA that has not been added to the trust store), so compare with `-showcerts` before drawing a conclusion.

**Fix:** configure nginx to use the file that contains both the server certificate and the intermediate certificate. With Let's Encrypt, that is `fullchain.pem`, not `cert.pem`. Then reload nginx and check again.

## Error 3: wrong hostname

**Symptoms:** the browser says the name in the certificate does not match. With OpenSSL and `-verify_hostname`, you see:

```
verify error:num=62:hostname mismatch
Verification error: hostname mismatch
Verify return code: 62 (hostname mismatch)
```

**Check:** read the list of names the certificate covers:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -ext subjectAltName
```

The name you visit must appear in the `DNS:` list (or match a wildcard entry such as `*.example.com`; that entry covers only one level of subdomain, so it does not cover `example.com` itself). Two common causes:

- The certificate was issued only for `example.com`, while users visit `www.example.com`.
- SNI is not sent, so the server returns the default certificate of another domain. Try again with and without `-servername` to compare; `-noservername` turns this extension off entirely.

**Fix:** issue the certificate again with all the names you need (one `-d` per name with certbot), or fix the configuration so that the right `server` block serves the right name.

## Checking in order

When you receive a report that "the web shows a certificate error", you can follow a fixed order:

1. Run `s_client` with `-servername` and `-verify_hostname`, and read `Verify return code`.
2. If the error is about validity: read `notAfter` and check the system clock.
3. If the error is that the issuer cannot be found: use `-showcerts` to count how many certificates the server sends.
4. If the error is about the name: read the SAN and compare it with the name being visited.

Only fix the server once you know clearly which type of cause it is, and always check again with the same command after fixing.

## Common mistakes when using `openssl` itself

- **Forgetting `-servername`:** you get the default certificate, leading to a wrong conclusion.
- **Forgetting `echo |`:** the command hangs waiting for your input.
- **Trusting `Verify return code` without specifying a trust store:** `openssl` uses the system's default store; if you test with an internal CA, pass `-CAfile ca.crt`.
- **Pasting the private key into a forum when asking for help:** share only the public certificate and command output, never `privkey.pem`.

## Summary

The three errors, expiry, a missing intermediate certificate and a wrong hostname, account for most certificate incidents. With `openssl s_client` to see the verification code and `openssl x509` to read the expiry date and the SAN, you can tell them apart in a few commands. Adding `-checkend` to your monitoring lets you learn that a certificate is about to expire before your users do.

## References

- [OpenSSL 3.0 documentation: openssl-s_client](https://docs.openssl.org/3.0/man1/openssl-s_client/)
- [OpenSSL 3.0 documentation: openssl-x509](https://docs.openssl.org/3.0/man1/openssl-x509/)
- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://datatracker.ietf.org/doc/html/rfc5280)
- [RFC 6125: Representation and Verification of Domain-Based Application Service Identity](https://datatracker.ietf.org/doc/html/rfc6125)
- [Certbot: user guide](https://eff-certbot.readthedocs.io/en/stable/using.html)
