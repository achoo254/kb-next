---
title: User-defined bridge networks in Docker: containers calling each other by name through built-in DNS
tags: docker, networking, user-defined-bridge, dns, ubuntu
type: lab
---

> [!TLDR]
> - On a user-defined bridge network (`docker network create`), containers can resolve each other by name or alias; on the default network they cannot.
> - A user-defined network isolates better: only containers on the same network see each other, and you can attach or detach containers while they run.
> - Applications should call `http://web` instead of an IP address, because a container's IP can change each time it is recreated.

## Goal

You will create a dedicated bridge network, run two containers in it and let them call each other by name. You will also see clearly why you should use a user-defined network rather than the default one for applications made of several containers.

## Preparation

- Docker Engine on Ubuntu 24.04 LTS (the article was checked against version 29).
- Read [[Docker's default bridge network and publishing ports with -p]] first to know how the default `bridge` network works.
- An Internet connection to pull the `nginx` and `busybox` images.

## Why the default network is not enough

According to Docker's documentation, a user-defined bridge network has these advantages over the default one:

- **Automatic name resolution.** On the default network, containers see each other only by IP address (unless you use the `--link` flag, which the documentation classes as legacy). On a user-defined network, containers look each other up by name or alias.
- **Better isolation.** Every container without a `--network` option lands on the default network, so unrelated services can still talk to each other. A user-defined network keeps each application in its own circle.
- **Attach and detach while running.** With a user-defined network, you can `connect` or `disconnect` a container while it is running. To take a container off the default network you must stop it and recreate it.

The first point is the one you use every day: a container's IP address is assigned by Docker and can change when the container is recreated, whereas a name is chosen by you and stays stable.

## Steps

### 1. Create the network

```bash
docker network create app-net
docker network ls
```

If you do not specify a driver, Docker uses the `bridge` driver. To choose the address range yourself, add `--subnet 192.0.2.0/24` (an example range is used here; on a real machine pick a private range that does not clash with your network).

### 2. Run a container in that network

```bash
docker run -d --name web --network app-net nginx
```

The container name `web` is its DNS name in the `app-net` network. Note, as the documentation points out: the automatic resolution only recognizes the names you set (and aliases), not the random names Docker generates.

### 3. Call it by name from another container

Run a temporary container on the same network to call `web`. The `--rm` flag removes the temporary container when it ends:

```bash
docker run --rm --network app-net busybox wget -qO- http://web
```

You will get back the nginx welcome page. You do not need to know the IP of `web`, and you do not need to publish a port: traffic between containers on the same network goes straight over the virtual bridge.

### 4. Network aliases

A container can get an extra name in a network with `--network-alias`:

```bash
docker run -d --name web2 --network app-net --network-alias frontend nginx
docker run --rm --network app-net busybox wget -qO- http://frontend
```

Aliases help when an application is preconfigured with a name such as `db` or `cache` while the real container name is different.

### 5. Attach another network while running

Suppose a container must talk to two different applications. Create a second network and attach it:

```bash
docker network create other-net
docker network connect other-net web
docker network inspect other-net
```

Now `web` is on both networks, and containers on `other-net` can call `web` by name. To detach: `docker network disconnect other-net web`.

## Verification

- `docker network inspect app-net` lists the attached containers with their addresses.
- Try a control test on the default network: `docker run --rm busybox wget -qO- http://web` will fail because the name `web` is not resolved there (the temporary container is not on `app-net`).
- `docker ps` shows that `web` has no published ports, yet access from containers on the same network still works.

Clean up (these commands **delete containers and networks**; data inside the containers will be lost):

```bash
docker rm -f web web2
docker network rm app-net other-net
```

`docker network rm` only works when no container is using that network anymore.

## Common errors

- **Calling by name does not work**: the two containers are not on the same user-defined network, or you are on the default `bridge` network. Check with `docker network inspect`.
- **Using a generated name to call**: the random names Docker generates when you do not set `--name` are not resolved; set the name yourself.
- **Network name already exists**: `docker network create` reports an error on a duplicate; choose another name or use the existing network.
- **Address range conflict**: the range you chose with `--subnet` overlaps a network already on the machine or your internal network; choose another range.
- **Assuming two isolated networks block access from outside**: that isolation only concerns containers with each other. Ports published with `-p` are still open as described in the previous article.

## Summary

Treat a user-defined network as the good default for every multi-container application: one network per application, containers calling each other by name, and publish only the ports of the service that must serve users. When should you drop this virtual network layer altogether? The next article covers the host network.

## References

- [Bridge network driver, Docker Docs](https://docs.docker.com/engine/network/drivers/bridge/)
- [Networking overview, Docker Docs](https://docs.docker.com/engine/network/)
- [docker network create, Docker Docs](https://docs.docker.com/reference/cli/docker/network/create/)
- [Networking using a standalone container, Docker Docs](https://docs.docker.com/engine/network/tutorials/standalone/)
