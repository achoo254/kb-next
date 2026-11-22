---
title: Reading DMARC aggregate reports and fixing mail that lands in spam: from p=none to reject
tags: DMARC, DMARC reports, spam, email, troubleshooting
type: process
---

> [!TLDR]
> - A DMARC aggregate report is a compressed XML file sent by receiving servers to your `rua` address, showing who is sending mail on behalf of your domain and whether their SPF, DKIM and DMARC pass.
> - The safe process: `p=none`, review the reports and fix legitimate sources, then `quarantine`, then `reject`, increasing gradually with `pct`.
> - Mail lands in spam for many reasons besides authentication; debug starting from the `Authentication-Results` header of that very message.

## Introduction

The previous article set up a DMARC record with `p=none` and a `rua` address. After a few days, that mailbox starts receiving strange attachments. This article shows how to read them, use them to find forgotten or spoofed sources, and tighten the policy step by step. It continues the article “SPF, DKIM and DMARC: three DNS records that prove mail comes from your domain”; this is the last article in the series.

It is based on RFC 7489. The IETF has worked on a revision of this specification (often called DMARCbis); check the latest status on the RFC site or the IETF Datatracker, since the basic tags used in this article are the widely deployed part.

## What an aggregate report looks like

Large receiving servers send aggregate reports about once a day, usually as an XML file compressed with gzip or zip attached to an email. A report contains no message content, only statistics per source IP address.

Decompress and open the file in a text editor. On Ubuntu 24.04:

```bash
gunzip report.xml.gz        # for a .gz file
unzip report.zip            # for a .zip file (the unzip package)
```

A typical structure (shortened, using example addresses):

```xml
<feedback>
  <report_metadata>
    <org_name>Example Receiver</org_name>
    <report_id>123456</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain><p>none</p>
  </policy_published>
  <record>
    <row>
      <source_ip>192.0.2.10</source_ip>
      <count>120</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results>
      <dkim><domain>example.com</domain><selector>s2026</selector><result>pass</result></dkim>
      <spf><domain>example.com</domain><result>pass</result></spf>
    </auth_results>
  </record>
</feedback>
```

The parts to read:

- `report_metadata`: who sent the report and the period (times are in Unix seconds).
- `policy_published`: the DMARC policy the receiver saw when reporting.
- Each `record` is a group of messages from the same source IP: `source_ip`, `count` (number of messages), and `policy_evaluated` with the `dkim` and `spf` results *after alignment was considered*.
- `auth_results`: the raw DKIM and SPF results with the domain that was checked. If `auth_results` is `pass` but `policy_evaluated` is `fail`, the cause is almost certainly a **domain mismatch** (alignment).

Raw XML is hard to read when there are many sources. You can use an open-source DMARC report analyser or an existing service; since reports contain the IP addresses that send your mail, consider how much you trust a service that receives the data.

## The process of tightening the policy

### Step 1: observe with `p=none`

Leave `p=none` for at least a few weeks to see the full sending cycle (periodic mail at month end, invoices, newsletters). Group the `record` lines by `source_ip`.

### Step 2: classify each source

For each IP, answer:

1. **Yours and passing both**: nothing to do.
2. **Yours but failing**: for example an application server not yet in SPF, or a mail-sending service not yet signing with your domain. Fix SPF (`include` or `ip4`) or enable a custom-domain DKIM at the provider. You can look up the owner of an IP with `whois` (the `whois` package) or ask the team that runs the application.
3. **Not yours**: most likely spoofing or forwarded mail. This is exactly the kind of mail that `quarantine` and `reject` are designed to stop.

Watch for two cases that cause "false positives": **forwarded** mail (SPF breaks because the forwarding machine has a different IP) and **mailing lists** (which may modify headers or the body and break the DKIM signature). So a little legitimate mail failing DMARC is normal; RFC 8617 (ARC) is a mechanism built to help intermediaries preserve the original authentication results, but adoption depends on each receiver.

### Step 3: move to `quarantine` gradually

When all legitimate sources pass, change the policy to quarantine, starting with a small percentage:

```text
_dmarc.example.com.  IN TXT  "v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc-reports@example.com"
```

Increase `pct` gradually (for example 10, 25, 50, 100) and keep reading the reports after each increase. If something goes wrong, go back to `p=none` immediately; since DNS has a TTL, set a low TTL on the DMARC record during this phase.

### Step 4: `reject` once you are sure

Move to `p=reject` only when several weeks of reports in a row show no legitimate source failing. Do not forget `sp=` if subdomains also send mail, and set a policy for domains that do not send mail (for example spare registered domains) to block spoofing of them.

## When legitimate mail lands in spam

DMARC is only one of many signals. The debugging process:

1. Take one specific message that landed in spam and open "View source".
2. Read `Authentication-Results`. If SPF, DKIM or DMARC is not `pass`, go back to the previous article and fix the corresponding record.
3. If all three `pass` and the message still lands in spam, the cause is usually outside authentication: the reputation of the sending IP or domain, recipients marking mail as junk, content that looks like advertising, suspicious shortened links, or a sudden large volume from a new domain.
4. Check whether the sending IP is on public blocklists, and the mailbox provider's feedback-loop service if they offer one.
5. For bulk mail, provide a clear way to unsubscribe. Some large mailbox providers have published authentication requirements and spam-rate limits for high-volume senders; read the official sender guidelines of each provider you send to.

## Common mistakes

- **Pointing `rua` at an address that does not exist or has a full mailbox**: reports are lost, and you are blind.
- **Setting `reject` and only then reading the reports.** Read the reports before tightening.
- **Looking only at `auth_results`, not `policy_evaluated`.** DMARC relies on alignment, not just a raw pass.
- **Forgetting the sources few people remember**: printers, monitoring systems, customer-care tools, forms on the website.

## Summary

DMARC aggregate reports give you a map of every place that sends mail on behalf of your domain. Read them, fix the legitimate sources that still fail, then tighten the policy from `none` to `quarantine` and `reject` in small, reversible steps. When a specific message lands in spam, start from `Authentication-Results` and only then consider reputation and content.

## References

- RFC 7489, Domain-based Message Authentication, Reporting, and Conformance (DMARC): https://www.rfc-editor.org/rfc/rfc7489
- RFC 7208, Sender Policy Framework (SPF): https://www.rfc-editor.org/rfc/rfc7208
- RFC 6376, DomainKeys Identified Mail (DKIM) Signatures: https://www.rfc-editor.org/rfc/rfc6376
- RFC 8617, The Authenticated Received Chain (ARC) Protocol: https://www.rfc-editor.org/rfc/rfc8617
