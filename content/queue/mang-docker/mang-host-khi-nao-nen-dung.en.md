---
title: Docker host networking: dropping network isolation, and when to use it
tags: docker, networking, host-network, security, ubuntu
type: note
---

> [!TLDR]
> - With `--network host`, the container uses the host's network stack directly: no IP of its own, no NAT, and the `-p`/`-P` flags are ignored.
> - The benefits are performance and convenience when an application uses a wide range of ports; the price is losing network isolation and easily clashing with the host's ports.
> - Default to a user-defined bridge; choose host only after weighing both sides clearly.

## Introduction

The previous two articles covered bridge networks, where each container has its own "network room" connected to the host through a virtual bridge. Docker has a more extreme option: let the container **share** the host's network. That is the `host` driver. This article explains what it does, when it makes sense and the risks that come with it. It points back to [[User-defined bridge networks in Docker: containers calling each other by name through built-in DNS]] as the point of comparison. Commands were checked against Docker Engine 29 on Ubuntu 24.04 LTS.

## How host networking works

When you run:

```bash
docker run -d --name web-host --network host nginx
```

the container is **not** given an IP address of its own. It sees exactly the host's network interfaces, and when the application inside listens on port 80, that port 80 is the host's port 80. Check from the host:

```bash
curl -I http://127.0.0.1:80
```

Because there is no virtual network layer in between:

- **No port mapping is needed, and none exists.** According to Docker's documentation, in host mode `-p`, `--publish`, `-P` and `--publish-all` are all ignored, with the warning `WARNING: Published ports are discarded when using host network mode`.
- **There is no NAT**, and no userland-proxy process per port.

Docker Engine on Linux supports this driver. Docker Desktop supports it from version 4.34 and requires enabling the feature in settings; that is why the sample commands in this article are for Docker Engine on Ubuntu.

## When to use it

Docker's documentation gives two main reasons:

1. **Performance optimization.** There is no address translation and no proxy per port, so there is one less layer of processing on the packet's path.
2. **An application that needs a wide range of ports.** Instead of writing hundreds of `-p` options, the container uses the host's ports directly. An example is a service that must listen on a long run of consecutive ports.

Another practical reason you often see is a program that needs to see the host's network interfaces directly, such as a network diagnostics tool. Still, think twice: many cases can be solved with a user-defined bridge plus a few `-p` options, which is tidier and safer.

## The price to pay

### Loss of network isolation

On a bridge, the container sees only its virtual network. In host mode, a process in the container can listen on every interface of the host. If that process is exploited, the attacker stands right on the host's network. So host mode should not be used for untrusted services, or for services facing the Internet, without other safeguards.

### Port conflicts

A container in host mode and the other processes on the host share one port space. If the host already has a program listening on port 80, an nginx container in host mode cannot listen on port 80 and will report a bind error. Docker's documentation also notes a consequence of the same kind for swarm services: if a container listens on port 80, each swarm node can run only one such container.

### No separate virtual network anymore

A container in host mode is not on a user-defined bridge network, so it cannot use the call-by-container-name approach from the previous article. It talks to other containers through the host's address and the ports those containers have published.

### Hard to replicate

Running several copies of the same image on one machine easily clashes on ports in host mode, whereas on a bridge each copy has its own internal port and you only change the published port. That is why host mode suits poorly when you want to replicate containers.

## One more network: none

To complete the set of three default networks: `--network none` gives the container no network connectivity to the outside. It is for work that needs no network, or when you want to wire the network up some other way. The initial `docker network ls` list has exactly three networks: `bridge`, `host`, `none`.

## Verification and cleanup

After trying it, remove the container (this command **deletes the container `web-host`**):

```bash
docker rm -f web-host
```

Before running in host mode, ask yourself:

- Does the application truly need a wide port range or the highest performance?
- Is another program on the host using that port? Check with `ss -ltn`.
- If the process in the container is taken over, what is the damage at the host's network level?

## Common errors

- **Still writing `-p` and expecting it to work**: in host mode it is ignored. The port the application listens on is also the port on the host.
- **Container exits immediately because the port is busy**: another program holds the port; change the port in the application's configuration or stop the other program.
- **Running on Docker Desktop without enabling it**: you need to enable the host networking feature in settings, on version 4.34 or later.
- **Using host mode just to "avoid thinking about ports"**: that is a weak reason; the cost in isolation is usually bigger than the benefit.

## Summary

Host networking removes the virtual network layer entirely: slightly faster and suited to applications needing many ports, in exchange for losing isolation and having to manage port conflicts yourself. A short rule for the whole series: default to a user-defined bridge, publish as little as possible and bind to `127.0.0.1` when you can; use host only when there is a clear reason.

## References

- [Host network driver, Docker Docs](https://docs.docker.com/engine/network/drivers/host/)
- [Networking overview, Docker Docs](https://docs.docker.com/engine/network/)
- [Port publishing and mapping, Docker Docs](https://docs.docker.com/engine/network/port-publishing/)
