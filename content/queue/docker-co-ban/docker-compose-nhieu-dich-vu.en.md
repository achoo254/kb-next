---
title: Running a multi-service app with Docker Compose: depends_on with healthy checks and a .env file
tags: docker, docker compose, depends_on, healthcheck, environment variables
type: lab
---

> [!TLDR]
> - One `compose.yaml` file describes the whole application (web, database...) and `docker compose up` starts everything together.
> - `depends_on` with `condition: service_healthy` makes a service wait until its dependency is truly ready, not just "started".
> - Values that change per machine (passwords, ports) go in a `.env` file, not hard-coded and not committed to the code repository.

## Goal

Run an application made of two services, `app` and `db` (PostgreSQL), with a single command. You will see `app` start only once `db` reports healthy, and the password live in `.env` instead of the configuration file.

## Prerequisites

- Ubuntu 24.04 LTS with Docker Engine and the Compose plugin installed (see [[Installing Docker Engine on Ubuntu 24.04 from Docker's official apt repository]]). Check with `docker compose version`; this article was tried with Compose v5.
- An empty project directory, for example `~/demo`, and an application that has a Dockerfile. If you want a lean application, see how to build a light image in [[Multi-stage Dockerfiles: heavy builds, light runtime images]].

## Why Compose

Running containers one by one with `docker run` and dozens of options is easy to get wrong and hard to remember. Compose puts everything in one file: which image, which port, which environment variables, which service depends on which. The file sits next to the source code, so the whole team runs the same thing. The recommended file name is `compose.yaml`; the `version` field at the top of the file is obsolete and can be dropped.

Compose also creates a private network for the project. Services call each other by **service name**: `app` connects to the database at the address `db`, port 5432, with no need to know an IP.

## Steps

### Step 1: write compose.yaml

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
      POSTGRES_DB: appdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d appdb"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s

  app:
    build: .
    ports:
      - "${APP_PORT:-8080}:8080"
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/appdb
    depends_on:
      db:
        condition: service_healthy
```

A few points to understand:

- `${APP_PORT:-8080}` means "use the variable `APP_PORT`, and if it is not set, use 8080".
- `${DB_PASSWORD:?...}` makes the variable mandatory; if it is missing, Compose stops and prints the message, which avoids running a database with an empty password.
- The `healthcheck` of `db` uses `pg_isready`, a tool that ships in the PostgreSQL image, to learn whether the server accepts connections yet. The HEALTHCHECK idea is the same as in [[Running containers as non-root and adding a HEALTHCHECK to know your app is alive]].

### Step 2: create the .env file

In the same directory as `compose.yaml`, create `.env`:

```bash
DB_PASSWORD=change-this-password
APP_PORT=8080
```

Compose automatically reads the `.env` file in the project directory to substitute the `${...}` placeholders in `compose.yaml`. Add `.env` to `.gitignore`; if you need to share a template, commit a `.env.example` that holds only dummy values.

Note two different things: `.env` is used to **substitute values in the compose file**, while a service's `env_file:` entry loads variables **inside the container**. If you want variables from `.env` to be present in the container, you must declare them under `environment:` as in the example above (or use `env_file:`).

### Step 3: see the result after substitution

```bash
docker compose config
```

The command prints the final configuration with every variable substituted. It also reports syntax errors, so run it before `up`. Note that the output contains the real password, so do not paste it anywhere public.

### Step 4: run

```bash
docker compose up -d --wait
```

`-d` runs in the background; `--wait` makes the command wait until services are running (or healthy, if they have a healthcheck) before returning. If a service is not healthy, the command reports an error, which is handy in deployment scripts.

## What depends_on really does

The short form `depends_on: [db]` only guarantees that the `db` container is **started** before `app`. But PostgreSQL needs a few seconds to initialise, so `app` may open a connection too early and fail. The long form above has three conditions:

| Condition | Meaning |
| --- | --- |
| `service_started` | The container has been started (the default) |
| `service_healthy` | The service's healthcheck has reported healthy |
| `service_completed_successfully` | The service ran to completion and exited with code 0, suited to a database migration step |

The `service_healthy` condition works only when the dependency **has** a `healthcheck`. Your application should still know how to retry its connection when the database hiccups; `depends_on` only handles the startup order.

## Checking

```bash
docker compose ps
docker compose logs --tail 20 app
```

The status column of `db` must be `healthy`, and `app` must be `running`. Try removing the `DB_PASSWORD` line from `.env` and running `docker compose config` again: you will see the error message you put after `:?`.

When you are done:

```bash
docker compose down
```

This stops and removes the project's containers and network. Data in volumes is kept; adding `-v` removes the volumes too, so **warning**: `docker compose down -v` permanently deletes the database's data.

## Common problems

- **`app` fails to connect despite `depends_on`**: you used the short form, or `db` has no `healthcheck`. Switch to `condition: service_healthy`.
- **A variable is empty inside the container**: it exists only in `.env` and was not declared under `environment:` or `env_file:`.
- **Editing `.env` has no effect**: run `docker compose up -d` again so Compose recreates the containers with the new values.
- **The password leaked into the code repository**: change the password right away, then add `.env` to `.gitignore`.
- **You changed the password in `.env` but the database still accepts the old one**: PostgreSQL reads `POSTGRES_PASSWORD` only when it first initialises the data directory; once the data lives in a volume, change the password with an SQL command. Where the data lives is explained in [[Named volumes and bind mounts: where data lives when a container is removed]].

## Summary

Compose gathers the whole application into one file: use `depends_on` with `service_healthy` to wait at the right moment, `.env` for per-machine values, and `docker compose config` to review before running. A sensible next step is to understand where the data of `db` is stored.

## References

- [Control startup and shutdown order in Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Set environment variables in Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- [Interpolation in Compose files](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Compose file reference: services](https://docs.docker.com/reference/compose-file/services/)
- [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)
