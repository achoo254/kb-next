---
title: SPF, DKIM and DMARC: three DNS records that prove mail comes from your domain
tags: SPF, DKIM, DMARC, DNS, email
type: lab
---

> [!TLDR]
> - SPF lists the machines allowed to send mail for a domain; DKIM attaches a digital signature to the message; DMARC requires the results of those two to align with the `From:` line and tells the receiver how to treat failing mail.
> - All three are published as TXT records in DNS; start DMARC with `p=none` to observe only.
> - Each domain should have only one SPF record, and SPF is limited to 10 DNS lookups.

## Goal

After this article you will be able to write three DNS records for a sending domain (for example `example.com`): SPF, DKIM and DMARC, generate a DKIM key pair with `openssl` on Ubuntu 24.04 LTS, and check the records with `dig`. The previous article explained the article “How an email travels from sender to inbox: MUA, MSA, MTA, MX records and the two sender addresses”; if the concepts of the envelope address and the `From:` line are unfamiliar, read it first. The next article in the series is [[Reading DMARC aggregate reports and fixing mail that lands in spam: from p=none to reject]].

## Preparation

- Permission to edit the domain's DNS (at the registrar or the DNS provider).
- A list of every place that sends mail on behalf of the domain: your own mail server, bulk-mail services, application notification systems, CRM software... Missing one is a common reason legitimate mail is flagged as failing.
- An Ubuntu 24.04 LTS machine to run the commands. The domain and addresses in this article are only examples: `example.com`, `192.0.2.10`, `2001:db8::10`.

```bash
sudo apt update
sudo apt install bind9-dnsutils openssl
openssl version      # Ubuntu 24.04: OpenSSL 3.0.x
```

## Steps

### Step 1: SPF, the list of machines allowed to send

SPF (RFC 7208) is a TXT record placed at the domain itself, starting with `v=spf1`. The receiver takes the domain in the envelope address (MAIL FROM), looks up this record and compares the IP address of the sending machine with the list.

Example:

```text
example.com.  IN TXT  "v=spf1 ip4:192.0.2.10 ip6:2001:db8::10 include:_spf.mailservice.example.net ~all"
```

What each part means:

- `ip4:` and `ip6:`: allow a single address or a range of addresses.
- `include:`: merges the list of a mail-sending service provider. Use exactly the value the provider publishes.
- `mx` and `a`: allow the machines in the domain's MX records or A record.
- `all` comes last, with a result qualifier: `-all` (reject, fail), `~all` (softfail, suspicious but not hard-blocked), `?all` (neutral). When first rolling out, many people choose `~all` and switch to `-all` once they are sure the list is complete.

Two limits to remember:

1. **Only one SPF record per domain.** Two records starting with `v=spf1` produce a permanent error (permerror).
2. **At most 10 DNS lookups** caused by the `include`, `a`, `mx`, `ptr`, `exists` and `redirect` mechanisms. Exceeding it is also a permerror. So do not pile up too many `include`s; `ip4:` and `ip6:` cost no lookups.

Check:

```bash
dig +short TXT example.com
```

### Step 2: DKIM, the digital signature inside the message

DKIM (RFC 6376) works with a key pair. The **private key** stays where the mail is signed (the mail server or the sending service) and is used to sign selected headers and the body; the **public key** is published in DNS so anyone can verify the signature. The signature lives in the `DKIM-Signature` header, where `d=` is the signing domain and `s=` is the **selector**, a name that lets one domain have several keys at once (for example for key rotation).

Generate a 2048-bit RSA key pair with `openssl`:

```bash
openssl genrsa -out dkim-private.pem 2048
openssl rsa -in dkim-private.pem -pubout -outform DER | openssl base64 -A
```

The second command prints a long base64 string; that is the `p=` part of the record. **The private key `dkim-private.pem` is a secret:** do not post it, do not send it over chat, do not commit it to a code repository, and give read permission only to the account that runs the signing service (`chmod 600`). If you hand the key to a third-party sending service, many providers generate the key themselves and give you the record to publish, which is more convenient.

The DNS record lives at the name `<selector>._domainkey.<domain>`. With the selector `s2026`:

```text
s2026._domainkey.example.com.  IN TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkq...(your base64 string)"
```

A 2048-bit key is longer than the 255-character limit of a single string in a TXT record, so the record must be split into several adjacent quoted strings; most DNS interfaces do this automatically. RFC 8301 requires signers to use RSA keys of at least 1024 bits and no longer use SHA-1; a 2048-bit key is the usual choice. Besides RSA, RFC 8463 adds the Ed25519 algorithm, but not every receiver supports it, so RSA remains the most compatible option.

The actual signing is done by your mail-sending software. With Postfix on Ubuntu, a common approach is the OpenDKIM packages (`opendkim`, `opendkim-tools`); follow the documentation of the software you use. Check the public record:

```bash
dig +short TXT s2026._domainkey.example.com
```

### Step 3: DMARC, linking SPF and DKIM to the From line

DMARC (RFC 7489) places a TXT record at `_dmarc.<domain>`. Start in observe-only mode:

```text
_dmarc.example.com.  IN TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```

The main tags:

- `v=DMARC1`: required, must come first.
- `p=`: the policy for the domain: `none` (report only), `quarantine` (put in spam), `reject` (refuse).
- `rua=`: the address that receives daily **aggregate reports** from receiving machines.
- `sp=`: a separate policy for subdomains; `pct=`: the percentage of mail the policy applies to; `adkim=` and `aspf=`: how strict the domain matching is, `r` (relaxed, the default) or `s` (strict).

A message **passes DMARC** when at least one of these is true: SPF passes *and* the domain in the envelope address matches the domain in `From:`; or DKIM passes *and* the `d=` domain matches the domain in `From:`. This idea of "matching" is called **alignment**; in relaxed mode, a subdomain still counts as matching the parent domain.

If the address receiving reports belongs to a *different domain* than the protected one, the receiver of the reports must publish an extra authorising record (see section 7.1 of RFC 7489), otherwise receiving machines will not send reports there. The simplest approach at first is to use a mailbox in the same domain.

## Verification

1. Wait for DNS to update (depending on TTL), then run the three `dig` commands again and compare character by character.
2. Send a message from your domain to another mailbox, open "View source" and look for `Authentication-Results:`: you expect to see `spf=pass`, `dkim=pass` and `dmarc=pass`.
3. If you see `fail` or `none`, check the Common mistakes section below.

## Common mistakes

- **Two SPF records.** Merge them into a single record.
- **Exceeding 10 DNS lookups.** Reduce `include`s, replace them with `ip4:` when the provider has fixed, stable IP ranges.
- **A DKIM record that is truncated or has extra spaces.** Copy the base64 string carefully again; use `dig` to see the actual record.
- **Setting `p=reject` too early.** Legitimate mail from a system you forgot to list will be rejected. Start with `p=none`.
- **A third-party service signing with its own domain.** The message passes DKIM but does not match `From:`, so it still fails DMARC; configure a custom domain at the provider so they sign with your `d=`.
- **Forwarding and mailing lists.** SPF often breaks when mail is forwarded because the sending IP changed; DKIM usually survives if the content is not modified.

## Summary

SPF answers "is this machine allowed to send for the domain", DKIM answers "was the message really signed by the domain and is it intact", and DMARC forces those two answers to align with the `From:` line users see and lets the domain owner say how to handle the result. Deploy in the order SPF, DKIM, then DMARC with `p=none`; the next article shows how to read the reports to tighten the policy safely.

## References

- RFC 7208, Sender Policy Framework (SPF): https://www.rfc-editor.org/rfc/rfc7208
- RFC 6376, DomainKeys Identified Mail (DKIM) Signatures: https://www.rfc-editor.org/rfc/rfc6376
- RFC 8301, Cryptographic Algorithm and Key Usage Update to DKIM: https://www.rfc-editor.org/rfc/rfc8301
- RFC 8463, A New Cryptographic Signature Method for DKIM (Ed25519): https://www.rfc-editor.org/rfc/rfc8463
- RFC 7489, Domain-based Message Authentication, Reporting, and Conformance (DMARC): https://www.rfc-editor.org/rfc/rfc7489
