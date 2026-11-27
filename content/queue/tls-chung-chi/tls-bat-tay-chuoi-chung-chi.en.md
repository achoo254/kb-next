---
title: TLS handshakes and certificate chains: how a client comes to trust a server
tags: tls, certificates, https, pki, security
type: note
---

> [!TLDR]
> - TLS lets two sides agree on a shared key and lets the client check the server's identity before any real data is sent.
> - The server's certificate is trusted through a chain of signatures: the server certificate, an intermediate certificate, then a root certificate that already sits in the client's trust store.
> - Browsers check the signature, the validity period and the hostname; failing any one of the three produces an error.

## Introduction

Every time you open an address that starts with `https://`, the browser and the server perform a short "handshake" before exchanging any data. The handshake does two things: the two sides agree on a shared secret key to encrypt the connection, and the server proves that it really is the server for the domain you meant to visit. The protocol that does this is TLS (Transport Layer Security), the successor to SSL. The word "SSL" is still common in everyday speech, but the SSL versions have long been obsolete; what you are actually using is TLS.

This article explains how the handshake works, what a certificate contains and why a certificate chain makes a client trust a server. The next article in the series, [[Issuing and renewing Let's Encrypt certificates automatically with certbot and ACME on Ubuntu 24.04]], covers obtaining and renewing certificates.

## TLS does two jobs: encryption and authentication

Encryption is easy to picture: if someone eavesdrops on the connection, they only see scrambled data. But encryption alone is not enough. If you encrypt carefully but are talking to an impostor, everything is still exposed. That is why TLS also includes authentication: the server presents a certificate, and the client checks whether that certificate can be trusted for the domain being visited.

Think of a certificate as an ID card issued by a reputable third party. The card lists the domain it was issued for, the server's public key, the validity period and the issuer's signature. The issuer is called a certificate authority, or CA.

## The TLS 1.3 handshake step by step

TLS 1.3 is defined in RFC 8446. At a high level, the flow looks like this:

1. **ClientHello.** The client sends the versions and cipher suites it supports, some data for key agreement, and the domain it wants to reach through the SNI (Server Name Indication) extension. SNI lets one IP address serve many domains, each with its own certificate.
2. **ServerHello.** The server picks one cipher suite from that list and sends its own key-agreement data. At this point both sides have enough information to compute the same shared key, which an eavesdropper cannot compute.
3. **Certificate and proof of key ownership.** From this step on, the rest of the handshake is encrypted. The server sends its certificate, along with a signature proving that it holds the private key matching the certificate, and then sends a finishing message.
4. **Finish.** The client checks the certificate, sends its own finishing message, and application data (for example an HTTP request) starts to flow through the encrypted channel.

The improvement over TLS 1.2 is a leaner handshake: typically only one round trip is needed before application data can be sent. Many older cipher suites were also removed from TLS 1.3.

## What a certificate contains

An X.509 certificate (RFC 5280) has these important fields:

- **Subject:** the entity the certificate was issued to.
- **Subject Alternative Name (SAN):** the list of domain names the certificate is valid for, for example `example.com` and `www.example.com`. This is where modern browsers match the domain name.
- **Issuer:** the party that signed the certificate.
- **Not Before / Not After:** the period during which it is valid.
- The owner's **public key** and the issuer's **signature**.

You can view these fields with `openssl x509 -in cert.pem -noout -subject -issuer -dates -ext subjectAltName` (tried on OpenSSL 3.0.13, the version shipped with Ubuntu 24.04). The article [[Common certificate errors and how to check them with openssl: expiry, missing intermediates, wrong hostname]] reuses these commands.

## The certificate chain: why a stranger's certificate can be trusted

A browser cannot know every server on the Internet in advance. Instead, the operating system and the browser ship with a list of trusted root certificates, called the trust store. The root certificates in that store belong to root CAs, which guard their private keys very carefully and usually do not use them to sign individual servers directly.

Instead, the root CA signs one or a few **intermediate certificates**, and an intermediate certificate then signs the **server** certificate (also called the leaf). The result is a chain:

```
server certificate (example.com)
  └─ signed by: intermediate certificate
        └─ signed by: root certificate (already in the trust store)
```

The client walks the chain backwards: it verifies the server certificate's signature with the intermediate certificate's public key, then verifies the intermediate certificate against the root certificate. If the chain leads to a root present in the trust store and no link has expired, the certificate is accepted.

The practical consequence: the server should send both its own certificate and the intermediate certificates, but it does not need to send the root certificate because the client already has it. If the server forgets to send the intermediate certificate, some clients will report an error. This is a very common mistake and is analysed in the third article.

## Three things the client checks

On receiving a certificate, the client checks at least three things:

1. **Signature and trust chain:** the chain leads to a root certificate in the trust store.
2. **Validity period:** the current time lies between Not Before and Not After for every certificate in the chain.
3. **Hostname:** the name you are visiting matches an entry in the SAN (RFC 6125 describes how names are matched, including wildcards).

If any one fails, the connection is refused or the browser shows a warning. This is why certificate warnings should not be clicked away: it may simply be an expired certificate, but it could also be a sign of someone intercepting the connection.

## A small example to observe for yourself

If you want to see it with your own eyes, connect to an HTTPS server with `openssl s_client` and read the output:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -brief
```

The output shows the protocol version (for example `TLSv1.3`), the cipher suite, the server's certificate and the verification result. The `-servername` option sends SNI and `-brief` shortens the output (see `openssl s_client -help` on your machine).

## Summary

TLS both encrypts and authenticates. The handshake agrees on a shared key and hands the server's certificate to the client to check. The certificate is trusted through a chain of signatures from the server certificate, through an intermediate certificate, to a root certificate in the trust store. Once you understand this chain, you see why a missing intermediate, an expired certificate or a wrong hostname all make the connection fail. This article only presents the concepts at a general level; full details are in the RFCs below.

## References

- [RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile](https://datatracker.ietf.org/doc/html/rfc5280)
- [RFC 6125: Representation and Verification of Domain-Based Application Service Identity](https://datatracker.ietf.org/doc/html/rfc6125)
- [OpenSSL 3.0 documentation: openssl-s_client](https://docs.openssl.org/3.0/man1/openssl-s_client/)
- [OpenSSL 3.0 documentation: openssl-x509](https://docs.openssl.org/3.0/man1/openssl-x509/)
- [Let's Encrypt certificates (root and intermediate chain)](https://letsencrypt.org/certificates/)
