---
title: How an email travels from sender to inbox: MUA, MSA, MTA, MX records and the two sender addresses
tags: email, SMTP, MX, DNS, email infrastructure
type: note
---

> [!TLDR]
> - A message passes through several hops: the mail app (MUA), the server that accepts outgoing mail (MSA), the relaying servers (MTAs), and finally the recipient's mailbox server.
> - The sending server finds the receiving server through the MX DNS record of the recipient's domain.
> - Every message has two independent "sender addresses" (the envelope address and the From header); SPF, DKIM and DMARC exist because plain SMTP does not check them.

## Introduction

When you press "Send", your message does not fly straight into the recipient's inbox. It goes through a chain of servers, each doing its own job, with shared conventions called protocols between them. Understanding this chain is the foundation for configuring SPF, DKIM and DMARC later, because all three mechanisms hook into individual hops of the journey. This is the first article in a series about mail authentication; the next one is [[SPF, DKIM and DMARC: three DNS records that prove mail comes from your domain]].

This article only explains concepts and offers a few commands for observation; you do not need to install any mail server.

## The roles in a message's journey

Email documentation often uses four abbreviations. They name *roles*, not four different machines; in practice one program can play several roles.

- **MUA (Mail User Agent)**: the application where users write and read mail, such as a phone mail app or a browser webmail.
- **MSA (Mail Submission Agent)**: the server that accepts mail from the MUA in order to send it. It usually requires a login (authentication) and an encrypted connection.
- **MTA (Mail Transfer Agent)**: a server that moves mail from one place to another using the SMTP protocol. Postfix and Exim are two common examples of MTA software.
- **MDA (Mail Delivery Agent)**: the last piece, which drops the message into the user's mailbox on the receiving machine. The user then reads mail with IMAP or POP3.

The SMTP protocol is described in RFC 5321, while the structure of the message itself (header lines such as `From`, `To`, `Subject`, and the body) is in RFC 5322.

### Which port is used for what

- **Port 25**: used between MTAs, that is, to transfer mail between servers. Many network providers block outgoing port 25 from home networks and cheap virtual machines to limit spam.
- **Port 587**: used by the MUA to submit mail to the MSA (the "submission" port, RFC 6409), usually starting a connection and then upgrading to TLS with the STARTTLS command.
- **Port 465**: a TLS-encrypted connection from the very start for submitting mail; RFC 8314 recommends TLS for both sending and reading mail.

## From domain name to receiving server: the MX record

Suppose you send a message to `an@example.com`. The sending server only knows that the part after the `@` is `example.com`, so it asks DNS: "Which machine should mail for this domain go to?". The answer is in the **MX (Mail Exchanger)** record. Each MX record has a priority number and a host name; the lower number is tried first.

On Ubuntu 24.04 LTS, the `dig` command lives in the `bind9-dnsutils` package:

```bash
sudo apt update
sudo apt install bind9-dnsutils
dig +short MX example.com
```

The result looks like `10 mail1.example.com.` and `20 mail2.example.com.` if the domain has two receiving machines. If the priority-10 machine does not answer, the sender tries the priority-20 one. How your Ubuntu machine looks up DNS is explained in [[resolvectl and DNS on Ubuntu: how your machine looks up domain names]].

If a domain has no MX record, the rules in RFC 5321 allow the sender to try delivering to the domain's own address (the A or AAAA record). So do not assume that a missing MX definitely means the domain cannot receive mail.

### A concrete journey

1. You write the message in the MUA and press send. The MUA logs in to the provider's MSA over port 587 or 465.
2. The MSA accepts the message, checks that you are allowed to send, adds its own header lines and puts the message in a queue.
3. The sending MTA looks up the MX record of `example.com` in DNS, then opens an SMTP connection to the receiving machine on port 25.
4. The receiving machine runs its anti-spam checks. This is where SPF, DKIM and DMARC are evaluated.
5. If it accepts the message, the MDA drops it into the mailbox of `an@example.com`; the recipient reads it with IMAP or webmail.

Every server that relays the message adds a `Received:` line at the top. Reading these lines from bottom to top shows which machines the message passed through. In a mail app, the "View source" or "Show original" function displays all the headers.

## Two sender addresses: the envelope and the From header

This is the most important point of the article. A message has **two** sender addresses, and they are not necessarily the same.

- **The envelope address** (envelope sender, also called MAIL FROM or Return-Path): declared by the sending machine in the SMTP conversation with the `MAIL FROM` command. This is where bounce messages are sent. It is not displayed in the mail app.
- **The header address** (header From): the `From:` line the recipient sees in the mail app.

Picture a paper envelope. The address written on the outside lets the post office return the letter if it cannot be delivered; the signature at the bottom of the letter inside is what the reader sees. The two can differ, and nothing in plain SMTP forces them to match.

This gap makes it easy for attackers to impersonate a sender: they can set the `From:` line to the domain of a bank or a company whose servers they are not authorised to use. With the original protocol, the receiving machine has no standard way to tell the difference.

## How the three authentication mechanisms close that gap

- **SPF** checks whether the *IP address of the sending machine* is in the list allowed by the domain in the envelope address.
- **DKIM** checks the *digital signature* attached to the message: whether it was really signed by the domain and whether the content was altered on the way.
- **DMARC** ties the two mechanisms to the `From:` line that users see: it requires SPF or DKIM to pass *and* the passing domain to match the domain in `From:`, then lets the domain owner say what the receiver should do with failing mail.

All three are published as DNS records, so a domain owner only needs permission to edit DNS to switch them on. How to write each record is covered in the next article.

## See it for yourself

You can check these concepts with one of your own real messages:

1. Send a test message from your mailbox to another mailbox of yours.
2. Open the received message and choose "View source" (or "Show original").
3. Look for the `Received:` lines to count the hops, the `Return-Path:` line (the envelope address) and the `From:` line (the displayed address).
4. Look for an `Authentication-Results:` line, if present: it is the SPF, DKIM and DMARC result that the receiver recorded.

These headers may contain personal information (IP addresses, email addresses), so do not post them in full on a public forum when asking for help.

## Common mistakes when starting out

- **Mixing up the two sender addresses.** When debugging SPF, look at `Return-Path`, not `From`.
- **Assuming port 25 is open from everywhere.** Many networks block it; use port 587 or 465 for users' outgoing mail.
- **Forgetting DNS caching.** A record you just changed may not be visible right away because of caches (TTL).

## Summary

Mail goes from the MUA through the MSA, then through MTAs using SMTP; the sender finds the receiver through the MX record. Because plain SMTP lets the envelope address and the `From:` line differ without verification, SPF, DKIM and DMARC were added as DNS records. The next article turns those three records into concrete configuration steps.

## References

- RFC 5321, Simple Mail Transfer Protocol: https://www.rfc-editor.org/rfc/rfc5321
- RFC 5322, Internet Message Format: https://www.rfc-editor.org/rfc/rfc5322
- RFC 6409, Message Submission for Mail: https://www.rfc-editor.org/rfc/rfc6409
- RFC 8314, Cleartext Considered Obsolete: Use of TLS for Email Submission and Access: https://www.rfc-editor.org/rfc/rfc8314
