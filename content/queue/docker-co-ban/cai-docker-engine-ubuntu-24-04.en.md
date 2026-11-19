---
title: Installing Docker Engine on Ubuntu 24.04 from Docker's official apt repository
tags: docker, ubuntu, installation, apt, container
type: lab
---

> [!TLDR]
> - Install Docker Engine from Docker's official apt repository to get new releases and security fixes.
> - Remove old packages first, add the GPG key and the `docker.sources` entry, then install the five required packages.
> - Verify with `sudo docker run hello-world`; the `docker` group is convenient but almost equivalent to root.

## Goal

After this article you will have Docker Engine running on Ubuntu 24.04 LTS (codename `noble`), installed from Docker's official apt repository rather than the `docker.io` package that ships in Ubuntu's own repository. You will also know how to check that Docker works, how to update it later and how to remove it when you no longer need it.

Why use Docker's repository? Packages in the Ubuntu repository are frozen for each release, while Docker's repository follows the project's own release pace. Docker's official documentation describes installing from its apt repository on Ubuntu, so this article follows that approach.

## Preparation

- An Ubuntu 24.04 LTS 64-bit machine with `sudo` rights and Internet access.
- A machine that is not running any important container. The command that removes old packages in step 1 does not delete images or containers in `/var/lib/docker/`, but you should still know what your machine is running.
- If the machine has the `ufw` firewall enabled, be aware that ports you publish with Docker's `-p` can bypass `ufw` rules. Docker's documentation has a section on this; this article does not go into it.

If you want to refresh how services are managed on Ubuntu, read [[systemctl on Ubuntu 24.04: enabling, disabling and restarting services and checking their status]]. Docker runs as a systemd service and we will use those same commands.

## Steps

### Step 1: Remove unofficial packages

Ubuntu ships a few packages with the same purpose that are packaged by others. They conflict with the official version, so remove them first:

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y "$pkg"
done
```

If apt says none of them are installed, that is fine. This command does not touch `/var/lib/docker/`, so old images and volumes (if any) remain.

### Step 2: Add Docker's GPG key

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

This key lets apt verify the signatures of packages downloaded from Docker's repository. The `/etc/apt/keyrings` directory is the place meant for third-party repository keys.

### Step 3: Declare the apt repository

```bash
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
```

This is the deb822 source format (a `.sources` file). The expression inside `$(...)` reads the release codename from `/etc/os-release`; on Ubuntu 24.04 it yields `noble`. After `apt-get update` you should see a line that accesses `download.docker.com` in the output.

### Step 4: Install the packages

```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

The five packages are:

| Package | Role |
| --- | --- |
| `docker-ce` | The background service (the `dockerd` daemon) |
| `docker-ce-cli` | The `docker` command you type every day |
| `containerd.io` | The low-level runtime that runs containers |
| `docker-buildx-plugin` | The `docker buildx` command, the modern build engine |
| `docker-compose-plugin` | The `docker compose` command |

On Ubuntu, the Docker service is enabled and started right after installation.

## Verification

Check the version and the service status:

```bash
docker --version
sudo systemctl status docker --no-pager
```

Run a test container, a very small image that prints a greeting and exits:

```bash
sudo docker run hello-world
```

The first time, Docker downloads the `hello-world` image from Docker Hub, creates a container, prints a message that begins with "Hello from Docker!" and stops. Seeing that line means the whole chain of client, daemon, image download and container start works. You can see the exited container with `sudo docker ps -a`.

Check the two plugins:

```bash
docker buildx version
docker compose version
```

### Running docker without sudo?

By default only root and members of the `docker` group can talk to the daemon. Many guides tell you to add yourself to this group:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

Understand the cost: Docker's documentation states clearly that the `docker` group grants root-equivalent privileges, because a user in the group can run a container that mounts the machine's entire root directory. On your own personal or test machine that is acceptable; on a shared machine or a real server, think carefully, or look into rootless mode in the Docker documentation. Log out and back in so the new group takes effect in every session.

## Updating and uninstalling

Since Docker is now an apt repository like any other, updating is simply:

```bash
sudo apt-get update
sudo apt-get install --only-upgrade docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Updating the daemon can restart the Docker service, so containers without a restart policy may be stopped. Pick a suitable moment on a real server.

To remove the packages:

```bash
sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

`purge` does not delete the images, containers and volumes in `/var/lib/docker`. Deleting them is a separate operation, and WARNING: once deleted they cannot be recovered, so only do it when you are sure you no longer need that data.

## Common errors

- **`E: Unable to locate package docker-ce`**: step 3 was wrong or `apt-get update` has not been run. Check that `/etc/apt/sources.list.d/docker.sources` has all four lines and that the `Suites:` line shows `noble`.
- **Signature errors (`NO_PUBKEY` or "not signed")**: the key file is missing or unreadable. Download the key again and remember `chmod a+r`.
- **`permission denied while trying to connect to the Docker daemon socket`**: you are not yet a member of the `docker` group or have not logged in again after adding yourself. Use `sudo` or follow the section above.
- **`Cannot connect to the Docker daemon`**: the service is not running. Try `sudo systemctl start docker` and read the log with `journalctl -u docker`.
- **Installing `docker.io` and `docker-ce` side by side**: remove the unofficial one as in step 1 to avoid conflicts.

## Summary

Installing Docker Engine from the official repository takes four things: remove old packages, add the key, declare the repository, install the five packages. Verify with `hello-world`, remember that the `docker` group is almost root, and keep Docker updated with apt like any other software. From here you are ready to package a small application of your own with a Dockerfile.

## References

- [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) – Docker Docs
- [Linux post-installation steps for Docker Engine](https://docs.docker.com/engine/install/linux-postinstall/) – Docker Docs
- [Docker Engine security](https://docs.docker.com/engine/security/) – Docker Docs
