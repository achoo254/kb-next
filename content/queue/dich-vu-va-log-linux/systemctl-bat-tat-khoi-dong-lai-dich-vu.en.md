---
title: systemctl on Ubuntu 24.04: enabling, disabling and restarting services and checking their status
tags: systemctl, systemd, services, ubuntu, command line
type: lab
---

> [!TLDR]
> - `start`/`stop`/`restart` act right now; `enable`/`disable` decide whether the service starts at boot.
> - `systemctl status` tells you whether a service is running or failed, with the latest few log lines.
> - `enable --now` does both at once; `mask` blocks a service completely, so use it carefully.

## Goal

After this article you can control a service on Ubuntu 24.04 LTS (systemd 255) with `systemctl`: check its status, start, stop and restart it, and set it to start when the machine boots. If you are not yet familiar with units, first read [[systemd and unit files on Ubuntu 24.04: how services are described and started]].

## Preparation

- An Ubuntu 24.04 machine and an account with `sudo`.
- The examples use two service names: `systemd-resolved.service` (built in, only for viewing) and `hello.service` (a service you wrote yourself, assuming you created it as in the previous article). Replace them with your real service names.
- You can drop the `.service` suffix: `systemctl status hello` and `systemctl status hello.service` are the same.

## Steps

### Step 1: Check the status

```bash
systemctl status systemd-resolved
```

The output has a few notable parts: the `Loaded:` line shows which unit file is in use and whether the service is enabled (`enabled`); the `Active:` line shows `active (running)`, `inactive (dead)` or `failed`; below are the latest few log lines. If the output opens in a scrolling pager, press `q` to quit, or add `--no-pager`.

Three shorter commands, handy in scripts:

```bash
systemctl is-active hello      # prints active, inactive, failed...
systemctl is-enabled hello     # prints enabled, disabled, masked...
systemctl list-units --failed  # lists units in the failed state
```

### Step 2: Start and stop

```bash
sudo systemctl start hello
sudo systemctl stop hello
```

These two commands only affect the current run: after the machine reboots, the service goes back to following its `enable`/`disable` setting.

### Step 3: Restart and reload configuration

```bash
sudo systemctl restart hello
sudo systemctl reload hello
sudo systemctl reload-or-restart hello
```

- `restart` stops and starts again: there is a short interruption.
- `reload` asks the program itself to re-read its configuration without stopping, but it only works if the service declares how to reload (`ExecReload=`).
- `reload-or-restart` reloads if possible, otherwise restarts; useful when you are not sure.

Keep two easily confused things apart: `systemctl daemon-reload` reloads systemd's *unit files*, while `reload` reloads the *service's own configuration*.

### Step 4: Turn start-at-boot on and off

```bash
sudo systemctl enable hello
sudo systemctl disable hello
```

`enable` creates the links described by the `[Install]` section of the unit file but does not start the service right away. To enable and start in one go, use the `--now` flag:

```bash
sudo systemctl enable --now hello
sudo systemctl disable --now hello
```

The second form both removes start-at-boot and stops the service immediately.

### Step 5: Block a service completely with mask

```bash
sudo systemctl mask hello
sudo systemctl unmask hello
```

`mask` makes the unit impossible to start, even when another unit asks for it or you type `start`. Warning: only mask a service when you understand it; masking a system service by mistake can stop the features that depend on it. If that happens, `unmask` is the way back.

### Step 6: Clear a failed state

When a service fails, systemd remembers the `failed` state. After you have fixed the problem, clear that mark with:

```bash
sudo systemctl reset-failed hello
```

## Check

Try a small cycle with `hello`:

```bash
sudo systemctl enable --now hello
systemctl is-active hello      # expected: active
systemctl is-enabled hello     # expected: enabled
sudo systemctl restart hello
systemctl status hello --no-pager
```

If `status` shows `active (running)` with a fresh start time after the `restart`, everything is right. To see details of why something failed, read the logs as described in the next article on `journalctl`.

## Common mistakes

- **`Failed to enable unit: Unit file hello.service does not exist`:** the name is wrong or the file is not yet in `/etc/systemd/system/`; run `sudo systemctl daemon-reload` after creating the file.
- **`Access denied` or an authentication prompt:** you are missing `sudo` for a command that changes state.
- **A service is `enable`d yet does not start at boot:** `enable` does not start it now; check `systemctl is-enabled` and the logs of that boot.
- **`failed` right after `restart`:** read the logs; the usual cause is a wrong path in `ExecStart=` or a broken configuration.
- **Restarting over and over:** `Restart=always` can hide a real fault; systemd also has a limit on the number of attempts, and when it is exceeded the service goes to `failed`.

## Summary

Remember two groups of commands: `start`/`stop`/`restart`/`reload` for what happens now, `enable`/`disable` for what happens at boot, and `--now` to combine them. Use `status`, `is-active` and `is-enabled` to learn the state, and use `mask` only when you truly need it.

## References

- [systemctl — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [systemd.service — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd — Wikipedia](https://en.wikipedia.org/wiki/Systemd)
