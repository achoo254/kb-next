---
title: systemd and unit files on Ubuntu 24.04: how services are described and started
tags: systemd, unit file, services, ubuntu, linux
type: note
---

> [!TLDR]
> - systemd is the first program that runs when Ubuntu boots; it manages services and other "units".
> - Each service is described by a `.service` unit file with three main sections: `[Unit]`, `[Service]`, `[Install]`.
> - Files shipped by packages live in `/usr/lib/systemd/system/`; files you write or override live in `/etc/systemd/system/`.

## Introduction

When you turn on an Ubuntu server, a lot has to start: networking, logging, scheduling, web servers... Who decides the startup order, and who restarts a service when it crashes? On Ubuntu 24.04 LTS, that is **systemd** (version 255 ships with it). This article explains its core concept: the *unit* and the *unit file*. The next article, the article on `systemctl`, puts them to practical use.

## What systemd does

systemd is the system's process number 1 (PID 1). It starts services in parallel when it can, following the dependency order each service declares, and keeps watching them afterwards: a service that dies can be started again. Besides services, systemd manages several other kinds of units.

## Kinds of units

You recognize each kind by the suffix of the file name:

- `.service`: a service, for example a web server or a program running in the background.
- `.socket`: a network or local socket; systemd listens on it for you and starts the service when a connection arrives.
- `.timer`: schedules a service to run, similar to cron.
- `.target`: a group of units that acts as a "milestone" during boot; for example `multi-user.target` is the multi-user, command-line state of the system.
- `.mount`: a disk mount point.

In this article we go deep only on `.service`, the kind you will meet most often.

## Where unit files live

systemd reads unit files from several directories; the three most worth remembering are:

- `/usr/lib/systemd/system/`: files installed by software packages. Do not edit them directly, because a package update may overwrite them.
- `/etc/systemd/system/`: the administrator's files. A file here takes precedence over a file of the same name in `/usr/lib/systemd/system/`.
- `/run/systemd/system/`: temporary files, lost on reboot.

To see the file systemd is really using for a service (including any overrides), run:

```bash
systemctl cat systemd-resolved.service
```

The first line of the output shows the path of the original file.

## Anatomy of a .service file

Below is a simple example file for a program called `hello` (an illustration only; replace it with your own program):

```ini
[Unit]
Description=Illustrative hello program
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hello --port 8080
Restart=on-failure
User=hello

[Install]
WantedBy=multi-user.target
```

### The [Unit] section

It holds the description and the relationships with other units. `Description=` is the text shown when you view the status. `After=network.target` means "start after the network milestone has been reached". Note that `After=` only sets the *order*; to pull another unit in so it runs too, use `Wants=` (weak: if that unit fails, our service still runs) or `Requires=` (stricter).

### The [Service] section

It describes how to run the process:

- `ExecStart=` is the command that starts it; use the full path to the program.
- `Type=` tells systemd when to consider the service "started". `simple` (the default when `ExecStart=` is set but neither `Type=` nor `BusName=` is) treats the main process as the service; `forking` is for programs that spawn a child process and then exit; `oneshot` is for jobs that run once and finish.
- `Restart=on-failure` tells systemd to run it again when the process ends abnormally. Other common values are `no` (the default) and `always`.
- `User=` runs the program under an ordinary account instead of root, a good safety habit.

### The [Install] section

This section only matters when you run `systemctl enable`. `WantedBy=multi-user.target` means that when you enable the unit, systemd creates a link so the service is pulled in each time the system reaches `multi-user.target`, in other words it starts at boot.

## Writing your own service: the general steps

1. Create the file `/etc/systemd/system/hello.service` (you need `sudo`).
2. Ask systemd to re-read its configuration: `sudo systemctl daemon-reload`.
3. Check the file's syntax: `systemd-analyze verify /etc/systemd/system/hello.service`.
4. Start and enable the service, which the next article walks through.

Every time you edit a unit file, you must run `daemon-reload` again for the change to take effect.

## Overriding part of a unit without editing the original

To change one setting of a service installed by a package, use a **drop-in**:

```bash
sudo systemctl edit hello.service
```

The command opens a text editor and saves what you write to `/etc/systemd/system/hello.service.d/override.conf`. You only write the lines you want to change, for example:

```ini
[Service]
Restart=always
```

This is safer than editing the original file, because a package update will not erase your change.

## Common mistakes

- **You edited the file but see no effect:** you forgot `sudo systemctl daemon-reload`.
- **The service does not start because of the path:** `ExecStart=` should be an absolute path, and the program file must be executable.
- **Confusing `After=` with `Requires=`:** `After=` only orders things; it does not bring the other unit up.
- **Forgetting the `[Install]` section:** the service can still be started by hand, but you cannot `enable` it to start at boot.

## Summary

systemd manages services through unit files. A `.service` file has three parts: `[Unit]` for description and ordering, `[Service]` for how to run, `[Install]` for starting at boot. Package files live in `/usr/lib/systemd/system/`, yours in `/etc/systemd/system/`, and `systemctl edit` lets you override safely. After every change, remember `daemon-reload`.

## References

- [systemd.unit — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)
- [systemd.service — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd — Wikipedia](https://en.wikipedia.org/wiki/Systemd)
