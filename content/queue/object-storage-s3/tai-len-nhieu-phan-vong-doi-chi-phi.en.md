---
title: Multipart uploads, object lifecycle and how object storage costs add up
tags: S3, multipart upload, lifecycle, storage cost, object storage
type: note
---

> [!TLDR]
> - Upload large files in **multiple parts** (multipart upload): split them, send in parallel, retry single parts; remember to clean up abandoned uploads.
> - **Lifecycle rules** automatically delete old objects, move them to cheaper storage classes and clean up unfinished parts, so storage does not grow forever.
> - Costs usually include stored capacity, number of requests, outbound data and class-specific fees; read the provider's price list instead of memorising numbers.

## Introduction

Once you know what objects and keys are, and how requests are signed and authorised, three practical questions remain: how do you upload a file of tens of gigabytes reliably? how do you stop old data from piling up forever? and what items make up the bill? This article answers them in turn, with AWS CLI 2 examples on Ubuntu 24.04. Addresses and bucket names are for illustration only.

## Multipart upload

A single PUT request has a size limit (5 GB according to the Amazon S3 documentation), and a large file sent in one stream easily fails midway. **Multipart upload** solves this:

1. **Initiate**: the store returns an `UploadId`.
2. **Send each part** (with a part number), possibly in parallel; if a part fails you resend only that part.
3. **Complete**: you send the list of parts (part number and ETag), and the store assembles them into one object.

According to the Amazon S3 documentation, one upload can have at most 10,000 parts, each between 5 MiB and 5 GiB (the last part may be smaller than 5 MiB). Other S3-compatible stores may set their own limits.

### The AWS CLI does it for you

The `aws s3 cp` and `aws s3 sync` commands switch to multipart automatically when a file exceeds a threshold. The two related settings are `multipart_threshold` and `multipart_chunksize`. You change them with:

```bash
aws configure set default.s3.multipart_threshold 64MB
aws configure set default.s3.multipart_chunksize 16MB
```

With 16 MB parts and the 10,000-part limit, you can upload a file of about 160,000 MB; larger files need larger parts.

### Step by step with the low-level API

This helps you understand the mechanism and handle abandoned uploads:

```bash
# 1. Initiate; note the UploadId in the result
aws s3api create-multipart-upload --bucket example-media \
  --key sao-luu/db-2026-11.tar.zst --endpoint-url https://s3.example.com

# 2. Send part 1 (the file has already been split into parts, for example with split)
aws s3api upload-part --bucket example-media --key sao-luu/db-2026-11.tar.zst \
  --part-number 1 --body phan-001 --upload-id "<UploadId>" \
  --endpoint-url https://s3.example.com
# (note the ETag returned for each part, repeat for the other parts)

# 3. Complete with the list of parts
aws s3api complete-multipart-upload --bucket example-media \
  --key sao-luu/db-2026-11.tar.zst --upload-id "<UploadId>" \
  --multipart-upload file://parts.json --endpoint-url https://s3.example.com
```

The `parts.json` file looks like this:

```json
{
  "Parts": [
    { "PartNumber": 1, "ETag": "\"etag-phan-1\"" },
    { "PartNumber": 2, "ETag": "\"etag-phan-2\"" }
  ]
}
```

A few notes:

- **The ETag of a multipart object is not the MD5 of its content.** With Amazon S3 it is usually a "hash of hashes" with a `-<number of parts>` suffix, so do not use it to match the original file. If you need an integrity check, use a checksum the service supports, or store your own hash separately.
- **Parts that were sent but not completed still occupy space and are still billed as storage.** This is a "leak" that is easy to forget.

List and abort unfinished uploads:

```bash
aws s3api list-multipart-uploads --bucket example-media --endpoint-url https://s3.example.com
aws s3api abort-multipart-upload --bucket example-media \
  --key sao-luu/db-2026-11.tar.zst --upload-id "<UploadId>" \
  --endpoint-url https://s3.example.com
```

> **Warning:** `abort-multipart-upload` permanently deletes the parts already sent for that upload. Make sure the UploadId is correct and that the upload is no longer needed.

## Object lifecycle

A **lifecycle rule** is a configuration attached to a bucket so that the store does work over time by itself. Common actions:

- **Expiration**: delete objects after N days (or on a specific date).
- **Transition**: move to a cheaper storage class when data is rarely read (class names depend on the provider).
- **Noncurrent version expiration**: delete old versions when the bucket has versioning enabled.
- **Abort incomplete multipart upload**: clean up unfinished uploads after N days.

Rules apply through a **filter**, usually a prefix or a tag, so having a key convention from the start (as the first article in the series explained) helps. For example: logs under `logs/` are kept for 30 days and then deleted, and any upload left unfinished for more than 7 days is cleaned up.

```json
{
  "Rules": [
    {
      "ID": "delete-logs-after-30-days",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "clean-unfinished-multipart",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket example-media \
  --lifecycle-configuration file://lifecycle.json --endpoint-url https://s3.example.com
```

> **Warning:** an Expiration rule **deletes real data**, and the deletion happens automatically without asking. Check the filter carefully (an empty prefix applies to the whole bucket), test on a test bucket, and consider enabling versioning to have a way back. This is also tied to the requirement to keep and delete personal data on time, as discussed in [[Technical measures for complying with Law 91/2025/QH15: classification, encryption, logging, deletion and breach notification]].

Lifecycle is processed **asynchronously**: an object does not necessarily disappear at the exact moment it becomes due. Also review the rules whenever you change how keys are named.

## How costs add up

Price lists differ between providers and change over time, so here we only list the **items you usually meet**, so you know what to ask:

| Item | Meaning |
| --- | --- |
| Stored capacity | Billed per GB per month, with the price depending on the storage class. Includes old versions and unfinished multipart parts. |
| Requests | Each PUT, COPY, LIST, GET... is billed by count; usually each type has its own price. Millions of small objects can cost a lot in requests. |
| Outbound data | Downloading data to the internet (or to another region) is usually billed per GB; inbound data is usually free or cheap. |
| Cold storage classes | Cheaper to store but may carry retrieval fees, a minimum storage duration and retrieval latency. |
| Extra features | Cross-region copying, inventory, analytics, encryption with your own managed keys... |

A practical way to estimate for a body of data:

1. Estimate the average capacity per month (including old versions).
2. Count the requests of each type (write-heavy or read-heavy).
3. Estimate outbound traffic.
4. Multiply by the provider's list prices, then add a safety margin.

Tips to cut cost without changing functionality: clean up unfinished multipart parts, set expiry for temporary data and logs, compress before uploading, combine very small files into larger ones when reasonable, and place data close to where it is used to reduce outbound traffic. If you run an S3-compatible store yourself, the cost shifts to hardware, power, bandwidth and operations effort, but the "capacity, requests, data transfer" way of thinking still applies.

## Common mistakes

- **Forgetting abandoned uploads** and seeing storage grow for no obvious reason.
- **Setting an Expiration rule too broadly** and deleting data by mistake.
- **Comparing the ETag with the MD5** of a multipart file and concluding the file is corrupted.
- **Choosing a cold storage class for frequently read data**; retrieval fees can exceed the savings.
- **Not counting outbound transfer fees** when designing a system that serves many users.

## Summary

Multipart upload makes large transfers stable, but you must clean up abandoned parts. Lifecycle rules keep a bucket tidy and enforce discipline about how long data is kept, provided the filter is right. Cost is a combination of capacity, requests, outbound data and class specifics; always check the provider's current price list before deciding.

## References

- [Amazon S3: Uploading and copying objects using multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Amazon S3: Configuring a bucket lifecycle configuration to delete incomplete multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)
- [Amazon S3: Managing the lifecycle of objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [AWS CLI: S3 configuration (multipart_threshold, multipart_chunksize)](https://docs.aws.amazon.com/cli/latest/topic/s3-config.html)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
