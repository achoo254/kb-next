---
title: S3 request signing, presigned URLs and bucket access policies
tags: S3, SigV4, presigned URL, bucket policy, access control
type: note
---

> [!TLDR]
> - Every S3 request must be **signed** with a secret key using AWS Signature Version 4; the server recomputes the signature to verify it, and the secret key never travels over the network.
> - A **presigned URL** lets someone upload or download one specific object for a short time without being given your keys.
> - Permissions are decided by JSON **policies**: who, may do what, on which resource; access is denied by default, so grant the minimum and block public access unless you need it.

## Introduction

The previous article in this series showed that object storage is accessed over HTTP. The next question is: how does the store know who is calling, and whether that caller is allowed? This article explains three things: how requests are signed, how to create a presigned URL to share one object, and how to write an access policy for a bucket. The examples use AWS CLI 2 on Ubuntu 24.04; the addresses are examples only.

## How an S3 request is signed

To call S3 you need a pair of **access keys**: an access key ID (public, like a user name) and a **secret access key**. Tools such as the AWS CLI or an SDK use the secret key to **sign** each request with **AWS Signature Version 4 (SigV4)**. The main ideas of the process:

1. Build a "canonical request" string from the HTTP method, path, query parameters, the signed headers and a hash of the body.
2. Build a "string to sign" containing the algorithm, the time, the scope (date, region, service) and the hash of the canonical request.
3. Compute the **signing key** with an HMAC-SHA256 chain from the secret key, the date, the region, the service name and the text `aws4_request`, then sign the string from step 2.
4. Attach the signature in the `Authorization` header (or in query parameters, as with the presigned URL below).

The server holds your secret key, so it repeats these steps itself; if the two signatures match, the request is valid. As a result, **the secret key is never sent**, and if someone alters the request (for example, changes the key) the signature no longer matches. The time is part of the signature, so a client whose clock is too far off is rejected (usually with a `RequestTimeTooSkewed` error).

You rarely sign by hand, but knowing the mechanism helps you read the `SignatureDoesNotMatch` error: it is usually caused by a wrong key, wrong region, wrong endpoint, or a proxy that changed a header before the request reached the store.

Configuring keys for the CLI (sample keys; do not use real keys when writing documentation):

```bash
aws configure
# AWS Access Key ID: (your access key)
# AWS Secret Access Key: (your secret key)
# Default region name: us-east-1
```

> **Safety note:** do not put keys in a code repository, a screenshot or a chat message. Give each application its own keys with its own permissions, and rotate them when you suspect a leak.

## Presigned URLs

Suppose a user needs to download a report from a private bucket. You do not want to make the bucket public, and you do not want to hand out your keys. The solution: use your keys to **presign** a GET request for exactly that object, set an expiry, and give the resulting URL to the user. Anyone holding the URL, within the time limit, can perform **exactly that operation** on **exactly that object**.

With the AWS CLI:

```bash
aws s3 presign s3://example-media/bao-cao/2026-11.pdf \
  --expires-in 600 \
  --endpoint-url https://s3.example.com
```

The result is a long URL containing parameters such as `X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`, `X-Amz-SignedHeaders` and `X-Amz-Signature`. The `X-Amz-Expires` parameter is the number of seconds the URL stays valid (here 600 seconds, or 10 minutes). With SigV4 the maximum lifetime is 7 days; and if you sign with temporary credentials, the URL is also limited by the lifetime of those credentials.

To allow an **upload**, the URL must be signed for the PUT method. The `aws s3 presign` command only creates GET URLs by default, so for PUT you use an SDK (most have a function to create a presigned URL for PUT), and the client then sends a `PUT` with the content to that URL.

Things to remember:

- **A URL is a temporary key**: anyone who has it can use it. Do not write it to logs and do not send it over an untrusted channel.
- Set the **shortest expiry that works**.
- A URL's permissions never exceed those of the signer: if the signing account cannot read the object, the URL is useless.
- The signed headers (such as `Content-Type` for uploads) must match what the client sends, otherwise you get a signature error.

Test the URL with `curl` (only for objects you are allowed to access):

```bash
curl -sS -o bao-cao.pdf "<the generated URL>"
```

After it expires, the same command returns an `AccessDenied` error (status 403) with a message saying the request has expired.

## Bucket access policies

There are several layers of access control; two common ones are:

- **Identity policy**: attached to a user, group or role, saying "what this identity may do".
- **Bucket policy**: attached to a bucket, saying "who may do what with the bucket and the objects in it".

Both are JSON documents. The general principle (following the AWS model): all access is **denied** by default; an `Allow` statement opens access; a `Deny` statement overrides any `Allow`.

A sample policy that only allows reading objects under the prefix `public-assets/`, and only over an encrypted connection (HTTPS). Account, role and bucket names are only for illustration:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadAssetsOverTLSOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::example-media/public-assets/*",
      "Condition": { "Bool": { "aws:SecureTransport": "true" } }
    }
  ]
}
```

The elements: `Effect` (Allow or Deny), `Principal` (who; `*` means everyone, so think carefully), `Action` (operations such as `s3:GetObject`, `s3:PutObject`, `s3:ListBucket`), `Resource` (the ARN of the bucket or object) and `Condition` (extra conditions). Note that `s3:ListBucket` applies to the **bucket** (`arn:aws:s3:::example-media`), while `s3:GetObject` applies to **objects** (with `/*`).

Attach the policy with the CLI:

```bash
aws s3api put-bucket-policy --bucket example-media --policy file://policy.json \
  --endpoint-url https://s3.example.com
```

> **Warning:** a wrong policy can lock you out of your own bucket or open the data to the whole internet. Try it on a test bucket, and verify it again with an account that has no special privileges.

Amazon S3 also has a **Block Public Access** mechanism to prevent accidental public exposure; keep it on unless you really need to serve public content. Other S3-compatible stores may support only part of the policy language, so read the documentation of the store you use.

## Checking and common mistakes

- **403 `AccessDenied` when reading an object**: check the identity policy, the bucket policy, and whether any `Deny` statement applies.
- **`SignatureDoesNotMatch`**: check the key, region and endpoint, and whether an intermediary modifies headers; if the error is `RequestTimeTooSkewed`, fix the machine's clock.
- **`AccessDenied` with a presigned URL that has not yet expired**: the signer lacks permission, or the temporary credentials expired before the URL did.
- **Forgetting `/*` in Resource** when granting access to objects.
- **Using `Principal: "*"` together with `s3:*`**: almost always too broad.

## Summary

Every S3 request is signed with SigV4 so the store can verify identity without receiving the secret key. A presigned URL lets you share one operation on one object for a short time. JSON policies decide who may do what; grant the minimum and keep public-access blocking on. The next article in the series covers large files and cost: [[Multipart uploads, object lifecycle and how object storage costs add up]].

## References

- [Amazon S3: Authenticating requests with Signature Version 4 (query string)](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html)
- [Amazon S3: Sharing objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html)
- [AWS CLI: aws s3 presign](https://docs.aws.amazon.com/cli/latest/reference/s3/presign.html)
- [Amazon S3: Policies and permissions in Amazon S3 (policy language overview)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-policy-language-overview.html)
