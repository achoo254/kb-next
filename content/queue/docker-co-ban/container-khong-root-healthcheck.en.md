---
title: Running containers as non-root and adding a HEALTHCHECK to know your app is alive
tags: docker, security, healthcheck, non-root, container
type: lab
---

> [!TLDR]
> - By default the process in a container runs as the container's root; the `USER` instruction switches to an ordinary user.
> - `HEALTHCHECK` tells Docker whether the application can really serve requests or is just "running".
> - Add `--read-only`, `--cap-drop ALL` and `no-new-privileges` to narrow further what the container may do.

## Goal

In the previous article we got a small image thanks to a multi-stage build. But a small image is not automatically safe or trustworthy. This article does two things with that same Go application:

1. Run it as a user that is not root, so that if the application is exploited the attacker has fewer privileges.
2. Add a `HEALTHCHECK`, so Docker and you know whether the application is healthy or hung even though the process has not exited.

The article builds on the sample project from [[Multi-stage Dockerfiles: heavy builds, light runtime images]]. If you have not installed Docker yet, see [[Installing Docker Engine on Ubuntu 24.04 from Docker's official apt repository]].

## Preparation

- Docker Engine installed, and the `~/hello-docker` directory holding `main.go`, `go.mod` and `Dockerfile` from the previous article. That application already has a `/healthz` path that returns status 200.
- The `curl` tool on your machine for testing.

One important note: root *inside* a container is still a process on the real host, isolated only by Linux kernel mechanisms (namespaces, cgroups, capabilities). The isolation is good, but not invincible; that is why the principle of least privilege is still worth applying.

## Steps

### Step 1: See who the container runs as

With the `hello:multi` image from the previous article:

```bash
docker run -d --name hello -p 8080:8080 hello:multi
docker exec hello id
```

The result contains `uid=0(root)`: the application runs as the container's root, because the Dockerfile has not said anything else. Stop and remove it:

```bash
docker rm -f hello
```

### Step 2: Create a dedicated user and use `USER`

Change the last stage of the `Dockerfile` to:

```dockerfile
FROM alpine:3.20
RUN addgroup -S app && adduser -S -G app app
COPY --from=build /out/hello /usr/local/bin/hello
USER app
EXPOSE 8080
ENTRYPOINT ["hello"]
```

`addgroup -S` and `adduser -S` are BusyBox syntax on Alpine; they create a *system* group and user named `app`, with no password. The `USER app` instruction makes the commands after it, and the main process at run time, use this user. Port 8080 is above 1024, so no privilege is needed to listen on it.

On other bases such as Debian or Ubuntu, the commands to create a user are `groupadd` and `useradd`; check the documentation of the base image you use.

### Step 3: Add a HEALTHCHECK

Add to the last stage, after `USER`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
```

The command after `CMD` runs *inside the container*. If it exits with code 0 the check succeeds; code 1 means it failed. The options:

| Option | Meaning | Default |
| --- | --- | --- |
| `--interval` | How often to run the check | 30 seconds |
| `--timeout` | Longer than this counts as a failure | 30 seconds |
| `--start-period` | Start-up time during which failures are not yet counted | 0 seconds |
| `--retries` | Number of consecutive failures to be considered `unhealthy` | 3 |

We use `wget` because it is already in Alpine's BusyBox, so nothing extra needs installing. If your image has no such tool, give the application itself a self-check mode, or install the small tool you need.

### Step 4: Build again

```bash
docker build -t hello:safe .
```

## Verification

Run the container:

```bash
docker run -d --name hello -p 8080:8080 hello:safe
docker exec hello id
```

This time the `uid` is not 0 and the name is `app`. Next, look at the health:

```bash
docker ps --filter name=hello
docker inspect --format '{{.State.Health.Status}}' hello
```

Right after starting, the status column shows `(health: starting)`; after the first successful check it becomes `(healthy)`. The `inspect` command prints `starting`, `healthy` or `unhealthy`. To see the history of the checks:

```bash
docker inspect --format '{{json .State.Health}}' hello
```

To see the `unhealthy` state, you can try changing the path in `HEALTHCHECK` to one that does not exist, rebuild and wait through the retries.

### Narrowing permissions further at run time

Besides `USER`, Docker lets you restrict a container when you run it. Stop the old container and try:

```bash
docker rm -f hello
docker run -d --name hello -p 8080:8080 \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  hello:safe
```

- `--read-only` mounts the container's root filesystem read-only. An application that needs to write temporary files should add `--tmpfs /tmp`.
- `--cap-drop ALL` drops all Linux capabilities. The example program needs none. If your application needs a specific one, add back exactly that one with `--cap-add`.
- `--security-opt no-new-privileges` stops processes from gaining extra privileges through setuid files.

Our small application still runs normally; call `curl http://127.0.0.1:8080/` to be sure. With a real application you add the restrictions one at a time and test, because some programs need to write to disk or need a capability.

Clean up when done:

```bash
docker rm -f hello
```

## Common errors

- **`HEALTHCHECK` does not restart the container by itself.** With plain Docker Engine, the `unhealthy` state is only a label for you and other tools to read. The `--restart` policy reacts to the process exiting, not to `unhealthy`. Some orchestrators (such as Docker Swarm) use this label to replace the container; you need to know what the tool you use does.
- **Always `unhealthy` from the start**: check that the command can run inside the container (`docker exec hello wget -q -O /dev/null http://127.0.0.1:8080/healthz; echo $?`), that the port and path are right, and that a tool such as `wget` or `curl` exists in the image.
- **A `permission denied` error when the application writes a file**: the `app` user has no right to write to that directory. Use `COPY --chown=app:app` or `RUN chown`, or a volume with suitable permissions. Do not "fix" it by going back to root.
- **The application says it cannot write when using `--read-only`**: identify the directory it needs to write to (often `/tmp`) and attach a `--tmpfs` or a volume for exactly that directory.
- **A check that is too heavy or too frequent**: a `HEALTHCHECK` that runs a large query every few seconds can harm the application itself. Keep it light and check only the core function.

## Summary

Two small habits make your Dockerfile much more mature: use `USER` so you do not run as root, and use `HEALTHCHECK` to know the application can really serve requests. Add `--read-only`, `--cap-drop ALL` and `no-new-privileges` at run time and you have noticeably narrowed what a compromised container can do. This is not the whole of container security, but it is a solid foundation to start from.

## References

- [Dockerfile reference: USER and HEALTHCHECK](https://docs.docker.com/reference/dockerfile/) – Docker Docs
- [Docker run reference](https://docs.docker.com/engine/containers/run/) – Docker Docs
- [Docker Engine security](https://docs.docker.com/engine/security/) – Docker Docs
- [Building best practices](https://docs.docker.com/build/building/best-practices/) – Docker Docs
