---
title: VACUUM, autovacuum and slow queries in PostgreSQL with pg_stat_statements
tags: PostgreSQL, VACUUM, autovacuum, pg_stat_statements, slow queries
type: lab
---

> [!TLDR]
> - PostgreSQL does not overwrite a row on `UPDATE`/`DELETE` but leaves the old version behind ("dead tuples"); `VACUUM` cleans those up so the space can be reused.
> - **Autovacuum** runs in the background automatically; usually you only need to monitor it and tune it for tables with heavy writes or deletes, not switch it off.
> - To find slow queries, enable `log_min_duration_statement` and the `pg_stat_statements` extension, then sort by total execution time.

## Introduction

Once you know how to back up and restore with `pg_dump` and `pg_basebackup`, day-to-day operation revolves around two questions: is the database "tidy", and which queries are making it slow. This article explains VACUUM and autovacuum with examples you can run yourself, then uses `pg_stat_statements` to find time-consuming queries. The commands were tried with PostgreSQL 16.15 on Ubuntu 24.04.

## Why VACUUM is needed

PostgreSQL uses multi-version concurrency control (MVCC): when you `UPDATE` or `DELETE`, the old row is not removed immediately because another transaction may still need to read it. The old row becomes a "dead tuple". `VACUUM` scans the table, marks the space of dead tuples as reusable (but usually does not return it to the operating system), updates information used by queries, and keeps the transaction counter from "wrapping around".

If you do not clean up: tables and indexes swell ("bloat"), queries slow down gradually, and in extreme cases there is even a risk from exhausting the transaction ID counter, a situation in which PostgreSQL protects itself by forcing a cleanup.

### Observing dead tuples

Create a test table, delete half the rows and look at the statistics:

```sql
CREATE TABLE t (id int PRIMARY KEY, v text);
INSERT INTO t SELECT g, md5(g::text) FROM generate_series(1, 1000) g;
DELETE FROM t WHERE id <= 500;

SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables;
```

Right after the delete you will see about 500 live rows and 500 dead rows (statistics update with a slight delay, so exact numbers may differ a little). A manual cleanup with a detailed report:

```sql
VACUUM (VERBOSE, ANALYZE) t;
```

The output states how many rows were removed and shows that the table was analysed again (`ANALYZE` updates statistics so the planner can choose better execution paths). A plain `VACUUM` normally does not block reads or writes on the table.

One command that is easy to confuse is `VACUUM FULL`: it rewrites the whole table to genuinely return space to the operating system, but it takes an **exclusive lock** on the table while it runs and needs free disk space roughly equal to the size of the table. Use it only when you understand it and have a maintenance window.

To clean the whole cluster from the command line there is `vacuumdb --all --analyze` (add `-j N` to run N connections in parallel).

## Autovacuum: the background cleaner

By default `autovacuum` is on. It triggers a cleanup of a table when the number of dead rows exceeds a threshold:

```text
autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × number of rows in the table
```

The defaults are `50` and `0.2` (20%); check with:

```sql
SHOW autovacuum;
SHOW autovacuum_vacuum_scale_factor;
SHOW autovacuum_vacuum_threshold;
SHOW autovacuum_naptime;   -- default 1min: how often it comes to look
```

For a very large table, 20% is a lot of dead rows before cleanup. You can tune a single table instead of changing the whole cluster:

```sql
ALTER TABLE t SET (autovacuum_vacuum_scale_factor = 0.05);
```

What to do in operation:

- Do not turn autovacuum off. If it "slows the machine down", adjust how often and how fast it runs rather than disabling it.
- Watch `n_dead_tup` and `last_autovacuum` in `pg_stat_user_tables`; a table whose dead rows keep growing while `last_autovacuum` does not change needs a closer look.
- A transaction that stays open for a very long time (for example a session that forgot to `COMMIT`) holds on to dead rows, so VACUUM cannot clean them. Look at the sessions through `pg_stat_activity`.
- Enable `log_autovacuum_min_duration` if you want to log cleanups that take long.

## Finding slow queries

### Method 1: log queries over a threshold

The parameter `log_min_duration_statement` writes to the log every statement that runs longer than the threshold. The default is `-1` (off). For example, to log statements longer than 500 milliseconds, with no restart needed:

```sql
ALTER SYSTEM SET log_min_duration_statement = '500ms';
SELECT pg_reload_conf();
```

PostgreSQL's log on Ubuntu is at `/var/log/postgresql/postgresql-16-main.log`. Choose a threshold high enough that the log does not flood; you can start with a few hundred milliseconds or one second depending on the system.

### Method 2: aggregate with pg_stat_statements

The log tells you about each slow run; `pg_stat_statements` tells you **which queries cost the most cumulatively**, grouping statements that differ only in parameter values. This extension is a module that ships with PostgreSQL (on Ubuntu 24.04 it is available after installing the `postgresql` package; check with `SELECT name FROM pg_available_extensions WHERE name = 'pg_stat_statements';`), but it must be loaded at startup:

```sql
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
```

> **Note:** the command above **replaces** the whole old value of `shared_preload_libraries`. If other libraries are already listed, write the full list separated by commas. This change requires a cluster restart, so do it in a maintenance window.

```bash
sudo systemctl restart postgresql@16-main
```

Then create the extension in the database you want to monitor:

```sql
CREATE EXTENSION pg_stat_statements;
```

Query the statements that cost the most total time (in PostgreSQL 13 and later the columns are `total_exec_time` and `mean_exec_time`, in milliseconds):

```sql
SELECT calls,
       round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 2)   AS mean_ms,
       rows,
       left(query, 80)                     AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

A statement like `select ... where v like $1` appears with `$1` in place of the real value: that is how the extension groups statements of the same shape. How to read the result:

- High `total_ms`, very large `calls`: a light query called far too often; check whether the application calls it in a loop.
- High `mean_ms`, few `calls`: a heavy query each time; look at the plan with `EXPLAIN (ANALYZE, BUFFERS)` on a test copy, then consider an index.
- To measure again from scratch after optimising: `SELECT pg_stat_statements_reset();`.

Note that `EXPLAIN ANALYZE` **executes** the statement; for `UPDATE`/`DELETE`, wrap it in a transaction and then `ROLLBACK`.

## Verification

- `SHOW shared_preload_libraries;` contains `pg_stat_statements`, and querying the view returns rows.
- `pg_stat_user_tables` shows `last_autovacuum` being updated on busy tables.
- `SHOW log_min_duration_statement;` has the value you set, and a deliberately slow statement (for example `SELECT pg_sleep(1)`) shows up in the log.

## Common errors

- **`ERROR: pg_stat_statements must be loaded via "shared_preload_libraries"`**: the module has not been loaded or the cluster has not been restarted.
- **A table keeps swelling despite autovacuum**: a long-open transaction, or a threshold too high for a large table; look at `pg_stat_activity` and tune `scale_factor` per table.
- **Running `VACUUM FULL` at peak hours**: it locks the table and the application stalls.
- **Setting `log_min_duration_statement = 0`** on a busy system: it logs every statement and floods the disk.
- **Forgetting that statistics accumulate from startup or from the last reset**: compare figures from two points in time to be fair.

## Summary

Dead tuples are a consequence of MVCC; `VACUUM` cleans them and autovacuum does that automatically, so you only need to monitor it, tune per table when needed, and avoid `VACUUM FULL` when busy. Find slow queries in two layers: a threshold log for individual runs, and `pg_stat_statements` for the overall picture. Together with secure connections and backups you have test-restored, this is the basic trio of PostgreSQL operation.

## References

- [PostgreSQL 16: Routine Vacuuming](https://www.postgresql.org/docs/16/routine-vacuuming.html)
- [PostgreSQL 16: VACUUM](https://www.postgresql.org/docs/16/sql-vacuum.html)
- [PostgreSQL 16: Automatic Vacuuming settings](https://www.postgresql.org/docs/16/runtime-config-autovacuum.html)
- [PostgreSQL 16: pg_stat_statements](https://www.postgresql.org/docs/16/pgstatstatements.html)
- [PostgreSQL 16: Error Reporting and Logging (log_min_duration_statement)](https://www.postgresql.org/docs/16/runtime-config-logging.html)
- [PostgreSQL 16: vacuumdb](https://www.postgresql.org/docs/16/app-vacuumdb.html)
