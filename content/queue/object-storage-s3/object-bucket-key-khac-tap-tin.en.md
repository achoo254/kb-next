---
title: Objects, buckets and keys in object storage: how they differ from files and folders
tags: object storage, S3, bucket, object key, cloud storage
type: note
---

> [!TLDR]
> - Object storage keeps data as **objects** (content plus metadata) inside **buckets**; each object is addressed by a **key** (a string), and there is no real folder tree.
> - A "folder" in a console is just a view built from a prefix and the `/` delimiter in the key.
> - Objects are written and read as a whole over HTTP (PUT, GET, HEAD, DELETE); they cannot be edited in the middle or renamed in place, so the model suits static files, backups, logs and large datasets rather than databases.

## Introduction

If you have used disks, network shares or a file server, you are used to the idea that "a file lives in a folder, and a folder lives in another folder". **Object storage** works differently. The S3 protocol introduced by Amazon has become the most common way to talk to this kind of store, and many other products (including software you run on your own servers) speak "S3" to varying degrees.

This is the first article in a series about object storage and S3. We will clarify the three keywords `object`, `bucket` and `key`, compare them with files and folders, and then run a few commands to see how the model behaves. The later articles cover request signing and permissions, then multipart uploads, lifecycle and cost.

## Three concepts: object, bucket, key

### Object

An **object** consists of:

- **Content** (binary data: an image, an archive, a log, a backup...).
- **Metadata**: name–value pairs that travel with it, such as `Content-Type`, `Cache-Control`, or metadata you define yourself.
- **Key**: the identifying name of the object within its bucket.

Unlike a file on a file system, an object has no "location on disk" that you can see, no `chmod`-style permissions, and you do not open it to write a few extra bytes into the middle.

### Bucket

A **bucket** is the top-level container for objects. A few points to remember (according to the Amazon S3 documentation):

- A bucket name must be unique within the service (globally, for AWS S3), so people often add a random string to the name.
- A name consists of lowercase letters, digits, dots and hyphens, 3 to 63 characters long. Other S3-compatible stores may set their own rules, so check the documentation of the store you use.
- Settings such as access policy, versioning and lifecycle rules are attached to the bucket.

Buckets **do not nest**: you do not put a bucket inside a bucket.

### Key

A **key** is a sequence of Unicode characters encoded in UTF-8, at most 1,024 bytes long (according to the AWS documentation). The pair (bucket, key) identifies exactly one object. For example:

```text
bucket:  example-media
key:     2026/11/anh-bia.jpg
```

With that key, many tools will show a folder `2026`, containing a folder `11`, containing the file `anh-bia.jpg`. In reality there is **one** object with **one** long key string that happens to contain `/` characters.

## "Folders" are just prefixes and delimiters

When you list objects, the API accepts two parameters: `prefix` and `delimiter` (usually `/`). The store will:

1. Filter the keys that start with `prefix`.
2. If a `delimiter` is given, group the keys that share the same segment up to the next occurrence of `/` into one "common prefix", and the interface displays that group as a folder.

Practical consequences:

- Creating an "empty folder" is not required. Some tools create an empty object whose key ends in `/` to simulate a folder, but that is only a convention.
- **Renaming** or **moving** a "folder" means copying each object to a new key and then deleting the old key. With millions of objects this takes time and costs requests.
- The objects `bao-cao/2026.pdf` and `bao-cao` can exist side by side, because they are simply two different keys. On a file system this is impossible.

## A quick comparison with file systems

| Aspect | File system / folders | Object storage (S3 style) |
| --- | --- | --- |
| Structure | A real directory tree | Flat: a bucket holds keys |
| Access | Open a file, read/write ranges | HTTP calls: PUT, GET, HEAD, DELETE |
| Changing content | Overwrite part of it, append | Rewrite the **whole** object |
| Renaming | One fast operation | Copy to a new key, then delete the old one |
| Permissions | Users, groups, chmod | Access policies, access keys |
| Scale | Bounded by the disk/volume | Very large, scales out |
| Good for | Apps that need file locking, databases | Images, video, backups, logs, static files, analytics data |

Because writes are whole-object, object storage is **not a network disk** for running a database or software that makes constant small writes. Some tools mount a bucket as a directory, but that is an emulation layer and its performance and consistency differ from a real disk.

## Trying it on the command line

Suppose you have installed AWS CLI version 2 on Ubuntu 24.04 and set your access keys with `aws configure`. For a self-hosted S3-compatible store, add `--endpoint-url`. The address below is only an example.

```bash
# Create a bucket (example name; a real name must be unique)
aws s3 mb s3://example-media --endpoint-url https://s3.example.com

# Upload a file, setting the key to 2026/11/anh-bia.jpg
aws s3 cp anh-bia.jpg s3://example-media/2026/11/anh-bia.jpg \
  --endpoint-url https://s3.example.com

# View it like a folder (prefix + delimiter used implicitly)
aws s3 ls s3://example-media/2026/ --endpoint-url https://s3.example.com

# See the metadata without downloading the content (HEAD)
aws s3api head-object --bucket example-media --key 2026/11/anh-bia.jpg \
  --endpoint-url https://s3.example.com
```

The `aws s3 ls` command prints a line `PRE 11/`: that is the common prefix, not a real folder. To see the mechanism, use the low-level API:

```bash
aws s3api list-objects-v2 --bucket example-media \
  --prefix 2026/ --delimiter / --endpoint-url https://s3.example.com
```

The JSON result has two parts: `Contents` (objects directly at that level) and `CommonPrefixes` (the child "folders").

> **Warning:** `aws s3 rm --recursive` and `aws s3 sync --delete` **delete data in bulk**. Run them with `--dryrun` first, and double-check which bucket and prefix they point to.

## A few properties worth knowing

- **Metadata is attached at write time.** To change the `Content-Type` of an existing object, you copy the object onto itself with new metadata (a metadata-replace operation); you do not edit it in place.
- **Versions.** When versioning is on, overwriting or deleting does not lose the old data: the store keeps the versions and adds a delete marker. This helps recovery but increases storage; the lifecycle article returns to this point.
- **Consistency.** With Amazon S3 today, once a write succeeds, reading it back returns the new data. With other S3-compatible stores, check their documentation because behaviour may differ.
- **Naming keys.** Use simple characters (unaccented letters, digits, `-`, `_`, `/`, `.`) to avoid URL-encoding problems in tools. Putting the date or the data type into the prefix makes listing and lifecycle rules easier.

## Common mistakes

- **Treating `/` as a real folder** and writing scripts that assume a rename is instant.
- **Forgetting that overwriting replaces everything.** If two processes write the same key, the last writer wins; if you need to prevent that, use versioning or a separate key for each write.
- **Choosing a guessable bucket name** and granting public access, which leads to data exposure. Access policies are covered in the next article: [[S3 request signing, presigned URLs and bucket access policies]].
- **Putting everything in one bucket** with no prefix convention, which makes it hard to apply rules per data group later.

## Summary

Object storage keeps **objects** (content plus metadata) in **buckets**, addressed by **key**; a "folder" is only a view built from prefixes. The model is simple, scales well and suits write-once, read-many data. Remember two things: a write replaces the whole object, and renaming means copy then delete. With that in mind, the later articles on signing, permissions and lifecycle are easier to follow.

## References

- [Amazon S3: What is Amazon S3?](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [Amazon S3: Naming Amazon S3 objects (object keys)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html)
- [Amazon S3: General purpose bucket naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
- [Amazon S3: Retaining multiple versions of objects with S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
