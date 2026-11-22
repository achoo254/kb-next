---
title: Backing up and restoring PostgreSQL: pg_dump, pg_restore and pg_basebackup
tags: PostgreSQL, backup, pg_dump, pg_basebackup, restore
type: lab
---

> [!TLDR]
> - There are two families of backup: **logical** (`pg_dump`, which exports the structure and data of one database) and **physical** (`pg_basebackup`, which copies the whole PostgreSQL cluster).
> - The `-Fc` format of `pg_dump` allows selective and parallel restores with `pg_restore`; a physical backup restores the whole cluster and is the foundation for point-in-time recovery.
> - A backup you have never test-restored is not yet a backup: restore into a different database on a regular schedule.

## Introduction

In the previous article, the article on connections, roles and `pg_hba.conf`, we set up a database `shopdb` with the role `app_user`. This article answers the question: if data is lost, how do we get it back?

PostgreSQL offers two main approaches, each suited to a different job:

| | Logical (`pg_dump`) | Physical (`pg_basebackup`) |
|---|---|---|
| Unit | one database | the whole cluster (all databases) |
| Content | commands/data to rebuild | a copy of the data files and WAL |
| Restore | `pg_restore` or `psql` | unpack into the data directory, then start |
| Suited to | small and medium databases, moving between machines, picking single tables | large databases, fast whole-cluster restore, foundation for replication and point-in-time recovery |
| Limitation | slow restore with large data | must be the same major version and architecture on restore |

The commands below were tried on Ubuntu 24.04 with PostgreSQL 16.15.

## Logical backup with pg_dump

### Preparation

`pg_dump` runs like an ordinary client, so it needs permission to read the tables. Running it as the `postgres` account on the server is the simplest:

```bash
sudo -u postgres pg_dump -Fc -f /var/backups/shopdb.dump shopdb
```

Make sure the destination directory exists and that `postgres` can write to it. The `-F` option selects the format: `p` (plain SQL text, the default), `c` (custom, compressed), `d` (directory, supports parallel dump with `-j`), `t` (tar). The option `-s` exports only the structure, `-a` only the data.

### Look inside the backup

The custom format has a "table of contents" you can view without restoring:

```bash
pg_restore --list /var/backups/shopdb.dump
```

The output lists each object (tables, table data, constraints...) together with the `pg_dump` version that produced the file.

### Restore

Restore into a new, empty database:

```bash
sudo -u postgres createdb shopdb_restore
sudo -u postgres pg_restore -d shopdb_restore --no-owner /var/backups/shopdb.dump
```

`--no-owner` skips assigning ownership as in the original, which is useful when the original role does not exist on the target machine. A few other `pg_restore` options: `-j N` restores in parallel with N processes, `-C` creates the database first (you connect to an existing database such as `postgres` and then it creates the new one), `-c --if-exists` drops old objects before recreating them.

> **Warning:** `--clean`/`-c` drops the objects that already exist in the target database before rebuilding them. Use it only when you are sure you are aiming at the right database; the safe habit is to restore into a new database, check it, and only then redirect the application.

For a quick check, count the rows in the restored table and compare with the original:

```bash
sudo -u postgres psql -d shopdb_restore -Atc "SELECT count(*) FROM t"
```

(The table `t` here is a sample table with 1,000 rows used during testing; replace it with your own table.)

### Limits to know about

- `pg_dump` does not export **roles** and **tablespaces** (things that belong to the whole cluster). Use `pg_dumpall --globals-only` to get that part separately.
- `pg_dump` gives a consistent snapshot as of the moment it starts without blocking others from reading or writing, but it does not help you restore to "ten minutes before the incident".

## Physical backup with pg_basebackup

`pg_basebackup` connects as a replication client, so it needs a `replication` line in `pg_hba.conf` (Ubuntu's default already has one for the local socket) and a role with the `REPLICATION` attribute or a superuser. An example run on the server itself:

```bash
sudo -u postgres pg_basebackup -D /var/backups/base -Ft -z -X stream -c fast -P
```

Meaning: `-D` the destination directory (must be empty or not yet exist), `-Ft -z` output as a gzip-compressed tar, `-X stream` also copies the WAL needed during the backup so the copy is self-sufficient, `-c fast` requests a checkpoint immediately instead of waiting, `-P` shows progress. The result consists of `base.tar.gz`, `pg_wal.tar.gz` and `backup_manifest`.

To verify the integrity of a copy in plain directory format (`-Fp`), use `pg_verifybackup` with the manifest file.

Restoring from a physical backup, at a high level:

1. Stop the cluster: `sudo systemctl stop postgresql@16-main`.
2. Rename or move away the old data directory (do not delete it yet), and recreate an empty directory owned by `postgres`.
3. Unpack `base.tar.gz` into the data directory and `pg_wal.tar.gz` into its `pg_wal` subdirectory.
4. Start the cluster again and check the log.

On Ubuntu the configuration files live separately in `/etc/postgresql/16/main/` rather than in the data directory, so back up `/etc/postgresql` with an ordinary file backup tool.

> **Warning:** steps 2 and 3 overwrite data. Practise first on a test machine, not on a production server.

To restore to an arbitrary moment (point-in-time recovery), you also need continuous WAL archiving (`archive_mode`, `archive_command`) next to the base backup. That is a topic of its own; this article only mentions it so you know a nightly snapshot is not enough if the requirement is "lose at most a few minutes of data".

## Scheduling and test restores

A minimal schedule could be: `pg_dump -Fc` every night for each important database, plus `pg_dumpall --globals-only`, written to a directory named by date, copied to a place other than the server, with old copies deleted according to a retention policy. Run it with `cron` or a systemd timer and write the result to a log (see [[journalctl: filtering logs by service and by time on Ubuntu 24.04]] if you run it as a systemd service).

More important than the schedule is **testing restores regularly**: at least every quarter, restore the latest backup into a test database or machine and run a few check queries. Measure the restore time too, so you know whether your time objective is realistic.

## Verification

- `pg_restore --list` reads the backup without errors.
- Restoring into a test database succeeds and the row counts match the original.
- The backup sits somewhere other than the original server.
- The restore commands are written down and anyone can follow them.

## Common errors

- **`pg_dump: error: server version mismatch`**: a `pg_dump` older than the server cannot dump it; use a tool whose version is equal to or newer than the server's.
- **`pg_restore: error: role "app_user" does not exist`**: the role does not exist on the target machine; create it first, or restore with `--no-owner`.
- **Forgetting that `pg_dump` does not contain roles**: back them up as well with `pg_dumpall --globals-only`.
- **`pg_basebackup` reports no replication permission**: the `replication` line is missing in `pg_hba.conf` or the role lacks `REPLICATION`.
- **Backing up only to the same disk as the data**: if the disk fails you lose both.
- **Never testing a restore**: you find out the file is broken or incomplete only on the day you need it.

## Summary

Use `pg_dump -Fc` and `pg_restore` for flexible logical backups of individual databases; use `pg_basebackup` when you need to copy the whole cluster and as the foundation for point-in-time recovery. Both must be stored elsewhere and test-restored often. Once the data is safe, the next job is keeping the database healthy and knowing which queries are slow, as in the next article: [[VACUUM, autovacuum and slow queries in PostgreSQL with pg_stat_statements]].

## References

- [PostgreSQL 16: pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html)
- [PostgreSQL 16: pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html)
- [PostgreSQL 16: pg_dumpall](https://www.postgresql.org/docs/16/app-pg-dumpall.html)
- [PostgreSQL 16: pg_basebackup](https://www.postgresql.org/docs/16/app-pgbasebackup.html)
- [PostgreSQL 16: Backup and Restore](https://www.postgresql.org/docs/16/backup.html)
- [PostgreSQL 16: pg_verifybackup](https://www.postgresql.org/docs/16/app-pgverifybackup.html)
