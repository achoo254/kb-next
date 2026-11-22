---
title: PostgreSQL on Ubuntu 24.04: connections, roles and pg_hba.conf
tags: PostgreSQL, pg_hba.conf, roles, authentication, Ubuntu 24.04
type: lab
---

> [!TLDR]
> - On Ubuntu 24.04, the `postgresql` package installs PostgreSQL 16; its configuration files live in `/etc/postgresql/16/main/`.
> - Access control has two layers: **roles** decide who someone is, while `pg_hba.conf` decides who may connect from where, to which database, and by which authentication method.
> - The first matching line in `pg_hba.conf` wins; after editing it you only need a reload, not a restart.

## Goal

By the end of this article you will have installed PostgreSQL 16 on Ubuntu 24.04 LTS, connected with `psql`, created a role and a database for an application, and read and edited `pg_hba.conf` so that exactly the right machines can connect. This is the first article in a series on operating PostgreSQL; the next one covers [[Backing up and restoring PostgreSQL: pg_dump, pg_restore and pg_basebackup]].

## Preparation

- An Ubuntu 24.04 LTS machine and an account with `sudo` rights.
- The examples use the documentation address range `192.0.2.0/24` for the application network. Replace it with your real network.

Install:

```bash
sudo apt update
sudo apt install postgresql
psql --version        # for example: psql (PostgreSQL) 16.x
pg_lsclusters         # lists the clusters on this machine
```

Ubuntu uses the `postgresql-common` tooling, so each "cluster" has a name such as `16 main`. The matching service is `postgresql@16-main`, wrapped by the umbrella service `postgresql`.

## Steps

### Step 1: first connection as the postgres system account

During installation Ubuntu creates an operating-system account called `postgres` and a database role of the same name. The simplest way in is to switch to that account:

```bash
sudo -u postgres psql
```

Inside `psql`, a few handy meta-commands (they start with a backslash):

```text
\conninfo     -- which account you are connected as, and to what
\l            -- list databases
\du           -- list roles
\q            -- quit
```

Why is no password needed? Because the line `local all postgres peer` in `pg_hba.conf` uses **peer** authentication: the server asks the operating system "who is running this process?" and accepts the connection if the name matches the role name.

### Step 2: create a role and a database for the application

Do not let an application use the `postgres` role (the superuser). Create a dedicated role that owns only its own database:

```sql
CREATE ROLE app_user LOGIN PASSWORD 'doi_mat_khau_nay';
CREATE DATABASE shopdb OWNER app_user;
```

The password above is only an example; choose a long, random one. A safer way is to type `\password app_user` in `psql` so the password does not end up in your command history; since PostgreSQL 14 passwords are stored hashed with `scram-sha-256` by default.

A role can have attributes such as `LOGIN` (may log in), `SUPERUSER`, `CREATEDB` and `CREATEROLE`. An application usually needs only `LOGIN`. The principle is to grant the minimum needed to do the job.

### Step 3: read pg_hba.conf

Open the file (the path is correct for Ubuntu's `16 main` cluster):

```bash
sudo less /etc/postgresql/16/main/pg_hba.conf
```

Leaving out the comment lines, the default on Ubuntu 24.04 looks roughly like this:

```text
# TYPE  DATABASE  USER      ADDRESS         METHOD
local   all       postgres                  peer
local   all       all                       peer
host    all       all       127.0.0.1/32    scram-sha-256
host    all       all       ::1/128         scram-sha-256
local   replication all                     peer
host    replication all     127.0.0.1/32    scram-sha-256
host    replication all     ::1/128         scram-sha-256
```

Each line has five main columns:

| Column | Meaning |
|---|---|
| TYPE | `local` (through a Unix socket on the same machine), `host` (TCP/IP), `hostssl` (TCP with TLS encryption only) |
| DATABASE | a database name, or `all`; `replication` is for physical replication and backup connections |
| USER | a role name or `all` |
| ADDRESS | an address or network range (CIDR); absent for `local` |
| METHOD | the authentication method: `peer`, `scram-sha-256`, `reject`, `trust`... |

The most important rule: the server reads from top to bottom and **uses the first matching line**; if authentication fails on that line the connection is rejected and later lines are not tried. So specific lines must come before general ones.

Avoid the `trust` method: it lets people in without a password.

### Step 4: allow the application machine to connect over the network

By default PostgreSQL listens only on localhost. To accept connections from other machines you need two things.

First, edit `listen_addresses` in `/etc/postgresql/16/main/postgresql.conf`. For example, if the database server has the address `192.0.2.10`:

```text
listen_addresses = 'localhost, 192.0.2.10'
```

This change **requires a restart**:

```bash
sudo systemctl restart postgresql@16-main
```

Second, add a line to `pg_hba.conf` that allows only the right user, the right database and the right network range, and require TLS if you have configured it:

```text
host    shopdb    app_user    192.0.2.0/24    scram-sha-256
```

It is fine for this line to come after the default lines, because none of them matches a connection from `192.0.2.0/24`. Then reload the authentication configuration (this does not drop existing connections):

```bash
sudo systemctl reload postgresql@16-main
# or inside psql: SELECT pg_reload_conf();
```

If you run a firewall, remember to open TCP port 5432 only for the network range that needs it.

## Verification

Try connecting with the new role over TCP:

```bash
psql -h 127.0.0.1 -U app_user -d shopdb
```

The server will ask for a password, because the line `host ... 127.0.0.1/32 scram-sha-256` matches. From another machine in the application network, replace `127.0.0.1` with `192.0.2.10`. To check whether the server accepts connections:

```bash
pg_isready -h 192.0.2.10 -p 5432
```

To find out how the server understood `pg_hba.conf` (the order, and whether any line has a syntax error), query the `pg_hba_file_rules` view:

```sql
SELECT line_number, type, database, user_name, address, auth_method, error
FROM pg_hba_file_rules;
```

A non-empty `error` column means that line is wrong and is ignored. To avoid typing a password in scripts you can use the `~/.pgpass` file (format `host:port:database:user:password`), but `psql` will only use it if the file has permissions `0600`.

## Common errors

- **`FATAL: no pg_hba.conf entry for host "192.0.2.50", user "app_user", database "shopdb"`**: no line matches. Check the network range, the user name, the database name and the `TYPE` (if you require `hostssl` but the client does not use TLS, it does not match either).
- **`FATAL: Peer authentication failed for user "app_user"`**: you are connecting through the Unix socket (no `-h`), so the `local ... peer` line matches, but your operating-system account name differs from the role name. Add `-h 127.0.0.1` to go through TCP, or change the `local` line to suit.
- **`FATAL: password authentication failed`**: wrong password, or the role has no password.
- **`connection refused` from another machine**: `listen_addresses` is still `localhost`, the service has not been restarted, or a firewall blocks port 5432.
- **Editing `pg_hba.conf` has no effect**: you forgot to reload, or you edited the wrong file. Ask the server itself: `SHOW hba_file;`.
- Adding a line like `host all all 0.0.0.0/0 ...` "for convenience" exposes every database to the network; always limit the network range.

## Summary

Remember two layers of control: roles (who) and `pg_hba.conf` (from where, to what, and how). The first matching line wins, so put specific lines before general ones. `pg_hba.conf` needs only a reload, while `listen_addresses` needs a restart. Use a separate role for each application, `scram-sha-256` passwords, and a limited network range. Once you can get in, the next important job is having a backup you can actually restore, as in the next article in the series.

This article only covers basic operations on the PostgreSQL 16 shipped with Ubuntu 24.04 (tested with version 16.15); for a real environment, read the official documentation carefully before changing the configuration.

## References

- [PostgreSQL 16: Client Authentication, pg_hba.conf](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html)
- [PostgreSQL 16: Database Roles](https://www.postgresql.org/docs/16/user-manag.html)
- [PostgreSQL 16: Connections and Authentication (listen_addresses)](https://www.postgresql.org/docs/16/runtime-config-connection.html)
- [PostgreSQL 16: pg_hba_file_rules](https://www.postgresql.org/docs/16/view-pg-hba-file-rules.html)
- [Ubuntu Server: Install and configure PostgreSQL](https://documentation.ubuntu.com/server/how-to/databases/install-postgresql/)
