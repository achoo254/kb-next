---
title: Docker's default bridge network and publishing ports with -p
tags: docker, networking, bridge, port-publishing, ubuntu
type: lab
---

> [!TLDR]
> - A container started without any `--network` joins the default `bridge` network, connected to the host through the virtual bridge `docker0`.
> - Ports inside a container are not opened to the outside automatically; to reach them from outside you must publish them with `-p host_port:container_port`.
> - `-p 8080:80` opens the port on every address of the host, while `-p 127.0.0.1:8080:80` makes it reachable only from the host itself.

## Goal

After this article you will understand where a container "sits" on the network right after `docker run`, know how to inspect the default bridge network, and publish a port the right way, including how to limit it to the host only. This is the first article in a series on Docker networking; the next two cover user-defined networks and the host network.

## Preparation

- Ubuntu 24.04 LTS with Docker Engine installed. If you have not installed it yet, see [[Installing Docker Engine on Ubuntu 24.04 from Docker's official apt repository]]. The article was checked against Docker Engine 29.
- Permission to run `docker` commands (your user is in the `docker` group, or use `sudo`).
- Port 8080 on the host is free. If you are not sure, you can see how to check listening ports in [[Checking network connectivity on Ubuntu with ip, ss, ping and tracepath]].

## What the default bridge network is

Once installed, Docker creates three networks for you. Take a look:

```bash
docker network ls
```

You will see three networks named `bridge`, `host` and `none`. The network named `bridge` uses the `bridge` driver and is the **default**: every container started without a `--network` option is attached to it.

In essence, the bridge driver is a software bridge inside the Linux kernel. Containers attached to the same bridge can talk to each other, while being isolated from containers on other bridges. For the default network, that bridge shows up on the host as `docker0`:

```bash
ip addr show docker0
```

Each container gets its own IP address from the bridge's private range. That address only means something inside the host. To see which containers are on the bridge and what the address range is, use:

```bash
docker network inspect bridge
```

The output is JSON; look at the `IPAM` entry (address range) and the `Containers` entry (the list of attached containers).

Two things to remember about the default network:

1. Containers can reach the Internet, because Docker uses NAT (masquerade) so that the container's address is replaced by the host's address on the way out.
2. Containers on the default network can only see each other by IP address, not look each other up by name. The next article solves that.

## Steps: publishing a port

Run an nginx web server in the background:

```bash
docker run -d --name web nginx
```

Nginx inside the container listens on port 80, but that port exists only inside the bridge network. From a browser or from another machine you cannot reach it. To open the port, publish it.

Remove the old container (this command **deletes the container `web`**; any data stored inside the container would be lost) and run it again with `-p`:

```bash
docker rm -f web
docker run -d --name web -p 8080:80 nginx
```

The syntax is `-p host_port:container_port`. Here port 8080 of the host is mapped to port 80 of the container. Docker implements the mapping with firewall rules (NAT and packet forwarding), not by "opening" a port inside the container.

List the container's mappings:

```bash
docker port web
```

### Host-only access

According to Docker's documentation, `-p 8080:80` creates a mapping for **every address** of the host (`0.0.0.0` and `[::]`), meaning it can be reached from outside if the network allows. If only the host itself needs to connect, for example because a reverse proxy on the same machine sits in front, state the address explicitly:

```bash
docker rm -f web
docker run -d --name web -p 127.0.0.1:8080:80 nginx
```

Now it is reachable only through the host's own loopback address. You can also bind the IPv6 loopback with `-p '[::1]:8080:80'`.

### Choosing a random port

If you do not need a fixed port, leave out the host part: `-p 80` lets Docker pick a free port on the host. The uppercase option `-P` publishes every port that the image declares with `EXPOSE` to random ports. Note the difference: an `EXPOSE` line in a Dockerfile on its own does **not** publish anything; it only documents the port the application uses.

## Verification

From the host itself:

```bash
curl -I http://127.0.0.1:8080
```

You should get an HTTP 200 response from nginx. With the `-p 8080:80` form (no address restriction), calling `http://host-address:8080` from another machine on the same network will also show the nginx page; with the `127.0.0.1:8080:80` form, that call must fail. Use `docker ps` to check that the PORTS column matches what you set.

Clean up when done (this deletes the container `web`):

```bash
docker rm -f web
```

## Common errors

- **`port is already allocated` or `address already in use`**: another program already uses the host port. Choose a different port or stop that program.
- **Cannot connect from outside despite `-p`**: check that the container is running (`docker ps`), that the application inside listens on all addresses rather than only the container's own `127.0.0.1`, and check the firewall of the network in front.
- **Expecting `ufw` to block a published port**: Docker's documentation states that Docker and `ufw` use firewall rules in ways that are incompatible; packets going through Docker's nat table are diverted before they reach the chains that `ufw` manages, so `ufw` rules usually do not apply to published ports. To block outside access, publish to `127.0.0.1` or read the firewall documentation page in the References carefully.
- **Confusing `EXPOSE` with `-p`**: as said above, `EXPOSE` is only documentation; `-p` is what creates the mapping.

## Summary

The default `bridge` network connects containers to the host through `docker0`, lets them reach the Internet, but keeps the container's ports on the inside. To reach them from outside, publish with `-p`; for more safety, bind to `127.0.0.1`. Containers on the default network cannot call each other by name yet, so the next article creates a dedicated network to solve that.

## References

- [Networking overview, Docker Docs](https://docs.docker.com/engine/network/)
- [Bridge network driver, Docker Docs](https://docs.docker.com/engine/network/drivers/bridge/)
- [Port publishing and mapping, Docker Docs](https://docs.docker.com/engine/network/port-publishing/)
- [Packet filtering and firewalls, Docker Docs](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
