---
title: Named volumes and bind mounts: where data lives when a container is removed
tags: docker, volume, bind mount, backup, file permissions
type: note
---

> [!TLDR]
> - A container's writable layer disappears with the container; data you need to keep must live in a named volume or a bind mount.
> - A named volume is managed by Docker and suits application data; a bind mount points straight at a directory on the host and suits source code or configuration.
> - Back up a volume with a temporary container that runs `tar`; when running as non-root, pay attention to file ownership.

## Introduction

When you remove a container, everything the application wrote to its filesystem (the writable layer) goes with it. For a stateless web server that is fine, but for a database, uploaded files or certificates it is a disaster. Docker has two main ways to put data **outside** the container's lifecycle: named volumes and bind mounts. This article explains the difference, how to choose, how to back up, and why file permissions so often cause trouble.

## Three places data can live

1. **The container's writable layer**: temporary, lost when the container is removed (`docker rm`), and slower than a volume for heavy writes.
2. **Volume**: a directory that Docker creates and manages on the host (with the `local` driver, under Docker's data directory). If it has a name it is easy to refer to again; if it has none, Docker gives it a random name and it is called an anonymous volume.
3. **Bind mount**: you specify an existing path on the host, for example `/srv/app/config`, and attach it to the container.

## Named volumes

Create and use one:

```bash
docker volume create pgdata
docker run -d --name db -e POSTGRES_PASSWORD=change-this-password \
  -v pgdata:/var/lib/postgresql/data postgres:16
```

The option `-v pgdata:/var/lib/postgresql/data` attaches the volume `pgdata` to the PostgreSQL 16 data path. Try removing the container and running it again with the same volume:

```bash
docker rm -f db
docker run -d --name db -e POSTGRES_PASSWORD=change-this-password \
  -v pgdata:/var/lib/postgresql/data postgres:16
```

The old database is still intact. A few useful commands:

```bash
docker volume ls
docker volume inspect pgdata
```

`inspect` shows the `Mountpoint`, which is where the volume sits on the host. Treat that as an internal detail of Docker and work through Docker, rather than editing files there directly.

In a Compose file, write it like this:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

With Compose, the real volume name is prefixed with the project name, for example `demo_pgdata`; check the exact name with `docker volume ls`.

**Removing a container does not remove a named volume.** A volume is lost only when you remove it yourself with `docker volume rm`, with `docker compose down -v`, or with `docker volume prune`. About `prune`: by default it removes only **anonymous** volumes that no container uses; add `--all` (`-a`) and it also removes unused named volumes. **Warning:** these commands delete data permanently, so read the list carefully before confirming.

## Bind mounts

A bind mount fits when you want the container to see a specific host directory, such as a configuration file or source code during development:

```bash
mkdir -p /srv/app/config
docker run -d --name web \
  --mount type=bind,src=/srv/app/config,dst=/etc/app,readonly \
  nginx:stable
```

The `--mount` syntax is more explicit than `-v`, and has one difference worth remembering: if the source path does not exist, `--mount type=bind` reports an error, while `-v /path:/target` silently creates that directory (usually owned by root). Add `readonly` when the container only needs to read. Keep in mind that a bind mount depends on the host's directory layout, so it is less portable than a volume.

| Criterion | Named volume | Bind mount |
| --- | --- | --- |
| Who manages it | Docker | You |
| Path on the host | Chosen by Docker | Chosen by you |
| Suited to | Application data, databases | Configuration, source code in development |
| Backup | Through Docker (see below) | Back up the directory as usual |

## File permissions when running as non-root

When the container runs as an ordinary user (good practice, see [[Running containers as non-root and adding a HEALTHCHECK to know your app is alive]]), write access to the mounted location is a frequent source of "Permission denied" errors:

- **A new, empty named volume**: Docker copies the contents and permissions of the target directory in the image into the volume the first time. If the image already ran `chown` on that directory for the non-root user, everything goes smoothly.
- **Bind mount**: the container sees the host directory's exact owner and permissions, counted by **numeric UID/GID**, not by name. If the container runs as UID 1000 but the directory belongs to root, writes will fail.

The fix: create the directory first and set its owner to match the UID the container uses, for example:

```bash
sudo mkdir -p /srv/app/data
sudo chown 1000:1000 /srv/app/data
docker run --rm --user 1000:1000 \
  --mount type=bind,src=/srv/app/data,dst=/data \
  ubuntu:24.04 touch /data/test.txt
```

Avoid the "quick fix" of `chmod 777`, because then every process on the host can write to that directory.

## Backing up and restoring a volume

Since Docker manages the volume, a neat way is to use a temporary container that mounts the volume read-only together with a bind mount to take the archive out:

```bash
mkdir -p ~/backup
docker run --rm \
  --mount type=volume,src=pgdata,dst=/data,readonly \
  --mount type=bind,src="$HOME/backup",dst=/backup \
  ubuntu:24.04 tar czf /backup/pgdata.tar.gz -C /data .
```

Restore into an **empty** volume (here `pgdata_new`):

```bash
docker volume create pgdata_new
docker run --rm \
  --mount type=volume,src=pgdata_new,dst=/data \
  --mount type=bind,src="$HOME/backup",dst=/backup,readonly \
  ubuntu:24.04 tar xzf /backup/pgdata.tar.gz -C /data
```

An important note: copying the files of a running database can produce an inconsistent copy. For a database, stop the container before archiving, or better, use its own tool such as `pg_dump`. Also test restoring your backups regularly; otherwise you do not yet know whether they are usable.

## Checking

- `docker volume ls` shows the volume you named.
- Remove the container and run it again: the data is still there.
- `tar tzf ~/backup/pgdata.tar.gz | head` lists the files in the backup.

## Common problems

- **Data loss from an anonymous volume**: the image declares `VOLUME` and you did not name it, and later you cannot tell which volume belongs to what. Always attach a named volume to the data path.
- **A bind mount covers a directory already in the image**: the image's content at that path is hidden, and the container sees only the host's directory.
- **`Permission denied` on write**: the UID in the container does not match the directory's owner; see the permissions section above.
- **`docker compose down -v` or `volume prune` deletes by mistake**: check the list and have a backup first.

## Summary

Containers are disposable; data is not. Use named volumes for application data, bind mounts for configuration and source code, match the UID when running as non-root, and back up with a temporary container. If you do not have Docker yet, start from [[Installing Docker Engine on Ubuntu 24.04 from Docker's official apt repository]].

## References

- [Volumes](https://docs.docker.com/engine/storage/volumes/)
- [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Compose file reference: volumes](https://docs.docker.com/reference/compose-file/volumes/)
