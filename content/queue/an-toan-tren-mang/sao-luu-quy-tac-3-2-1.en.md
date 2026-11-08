---
title: Backing up photos and data with the 3-2-1 rule: don't let one failed drive wipe out your memories
tags: backup, 3-2-1 rule, external drive, cloud storage, data safety
type: process
---

> [!TLDR]
> - Keep at least 3 copies of your data, on 2 different kinds of media, with 1 copy stored somewhere else.
> - A backup you have never tried to restore cannot be considered reliable.
> - Schedule backups automatically and remind yourself to check them regularly, because manual backups are easily forgotten.

## Introduction

Family photos, essays, contracts, work spreadsheets: most of them live in a single place, your phone or your computer. A device can be dropped, lost, stolen, or its storage can fail, or your data can be locked by ransomware. When that happens there is no way to "turn back time" unless you prepared beforehand.

This article introduces a simple and widely used principle, the **3-2-1 rule**, and shows how ordinary users can apply it without any technical background.

## What is the 3-2-1 rule

The rule consists of three numbers:

- **3 copies of your data**: the working copy and at least two backups.
- **2 different kinds of storage media**: for example the drive inside your computer and an external drive, or a drive and a cloud service. Two copies on the same drive means that when that drive fails, both are gone.
- **1 copy kept elsewhere**: a copy that is not in the same place as your computer, so that a fire, a flood, or a theft does not take everything.

The core idea is **not letting a single incident destroy every copy**. The causes of data loss are usually independent of each other, so spreading copies around reduces the risk considerably.

## A concrete example for a family

Suppose you have a few hundred gigabytes of photos and documents on a laptop:

1. **Copy 1**: the original data on the laptop.
2. **Copy 2**: copied to an external hard drive at home (the second type of media).
3. **Copy 3**: synced to a cloud storage service you trust (stored elsewhere).

That gives you all three elements: 3 copies, 2 kinds of media, 1 copy far away. If you prefer not to use the cloud, you can give a second external drive to a relative to keep for you and update it every few months.

## Choosing a backup method

### External hard drive

The advantages are speed, no dependence on the network, and a one-time cost. The drawbacks are that you must remember to plug it in and run the backup, and that drives have a limited lifespan and can fail at any moment. So never treat a single external drive as your entire strategy.

### Cloud storage

The advantage is that the copy lives elsewhere and usually runs quietly in the background. The drawbacks are that it needs an Internet connection, the free capacity is often limited, and sensitive data should be protected by an account with a strong password. See [[Strong passwords and password managers: break the habit of one password for everything]] to protect your storage account, because anyone who gets into that account can see all of your copies.

### Encrypting your backups

If the external drive holds personal documents, turn on the disk encryption that your operating system provides, so that someone who finds the drive cannot read its contents. Remember to store the unlock password somewhere safe, since losing the password also means losing the data.

## Steps

### Goal

Have at least two backups of your important data, one of them stored elsewhere, and know how to get your data back.

### Preparation

- List the folders that really matter: photos, documents, project folders. There is no need to back up the whole operating system and installed apps, as they can be reinstalled.
- An external hard drive with more capacity than the data you want to keep.
- A cloud storage account (if you choose that route) with two-step verification turned on.

### Steps

1. Go through your data, delete duplicates and junk files so the backup is lighter.
2. Copy the important folders to the external drive. Every operating system has a built-in backup tool, and you can use it to set up a schedule.
3. Turn on syncing or backup to the cloud for the same folders.
4. Set a repeating schedule, for example weekly or monthly, and add a reminder to your personal calendar to check it.
5. When the backup finishes, disconnect the external drive and store it somewhere dry. A drive that stays plugged in all the time can be encrypted along with the computer if ransomware strikes.

### Checking

This is the step most people skip. Every few months, **try a real restore**: pick a few random files from the backup, copy them to another folder and open them to see whether they are intact. A backup that has never been test-restored may have been broken for a long time without you knowing.

### Common mistakes

- **Having only one copy**, so when that drive fails everything is lost.
- **Leaving the backup drive permanently plugged in**, so an incident or malware affects both.
- **Confusing syncing with backup**: a sync service also syncs deletions. If you delete a file by mistake on your computer, it disappears from the synced location too. Choose a service with version history or a recycle bin that keeps files for a long time.
- **Never testing a restore**.
- **Forgetting the encryption password** of the backup itself.

## Summary

Backing up is not a one-time job but a small habit repeated over time. Remember three numbers: 3 copies, 2 kinds of media, 1 copy far away, then test restores regularly. Spend one afternoon setting it up and you will feel much calmer the day your computer suddenly refuses to start.

## References

- [Backup, Wikipedia (English)](https://en.wikipedia.org/wiki/Backup)
- [Backup, Wikipedia (Vietnamese)](https://vi.wikipedia.org/wiki/Sao_l%C6%B0u)
