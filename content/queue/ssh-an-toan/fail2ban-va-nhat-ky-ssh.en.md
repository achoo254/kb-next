---
title: Blocking SSH password guessing with fail2ban and reading login logs on Ubuntu 24.04
tags: fail2ban, ssh, logs, journalctl, ubuntu
type: lab
---

> [!TLDR]
> - fail2ban watches the `ssh` logs and temporarily blocks addresses that guess wrong many times, using the firewall.
> - Read login logs with `journalctl -u ssh`, and view history with `last` to know who has logged in.
> - fail2ban is an extra layer; it does not replace SSH keys and turning passwords off.

## Goal

A server with an SSH port open to the Internet receives a great many failed logins from automated probes. Once you use keys and have turned passwords off, these attempts cannot get in, but they still use resources and fill the logs with noise. This article shows how to install fail2ban (version 1.0.2 in the Ubuntu 24.04 repository) to block those addresses temporarily, and how to read login logs to spot anything unusual.

## Preparation

- Ubuntu 24.04 LTS with `sudo`, and SSH configured as in the first two articles of this planet.
- Know which SSH port you use (default 22) and the address you usually log in from, so you do not block yourself.
- The addresses in this article are examples from the ranges reserved for documentation: `198.51.100.7`, `192.0.2.0/24`.

## Steps

### Step 1: Install fail2ban

```bash
sudo apt update
sudo apt install fail2ban
```

### Step 2: Create your own configuration file

Do not edit `jail.conf`, because it can be overwritten when the package is upgraded. Create `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
# Addresses that are never blocked (your machine, the office network)
ignoreip = 127.0.0.1/8 ::1 192.0.2.0/24

# Ban time, counting window and number of failures allowed
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
backend = systemd
# If you changed the SSH port, remove the # and edit the number:
# port = 2222
```

Meaning: if an address fails to log in more than `maxretry` times within `findtime`, it is blocked for `bantime`. `backend = systemd` tells fail2ban to read the logs from the journal, which suits Ubuntu 24.04 because a minimal machine may not have the file `/var/log/auth.log`.

### Step 3: Enable and start the service

```bash
sudo systemctl enable --now fail2ban
```

## Checking

View the status of the `sshd` jail:

```bash
sudo fail2ban-client status sshd
```

The output shows the number of failures counted, the number of addresses currently blocked and their list. If you want to unblock an address (for example, you mistyped many times yourself):

```bash
sudo fail2ban-client set sshd unbanip 198.51.100.7
```

## Reading SSH login logs

On Ubuntu the SSH service is called `ssh`, so its logs are read with `journalctl` (filtering by service and time is explained in detail in [[journalctl: filtering logs by service and by time on Ubuntu 24.04]]):

```bash
# SSH logs from the past hour
sudo journalctl -u ssh --since "1 hour ago"

# Only the failed login lines
sudo journalctl -u ssh --since today -g 'Failed password|Invalid user'
```

Lines worth noticing:

- `Accepted publickey for deploy from ...`: a successful key login. Check that the user name and source address are really yours.
- `Failed password for ...` or `Invalid user ...`: someone is trying to guess. It is only worrying if there are large numbers from one source that fail2ban has not blocked, or if the user name being tried is a real account.
- To have the log record the fingerprint of the key used, you can set `LogLevel VERBOSE` in the sshd configuration.

View the history of finished logins:

```bash
last -n 10
sudo lastb -n 10
```

`last` lists recent successful logins. `lastb` lists failed ones; it reads `/var/log/btmp` and may be empty if the system does not write to that file. If you see a successful login you do not recognise, treat it as an incident: change your keys and check `~/.ssh/authorized_keys` for any strange line.

## Common errors

- **Blocking yourself**: mistyping the key many times or sharing a network address. Add trusted addresses to `ignoreip`, or use `unbanip` as above. This is why you should keep a fallback way in (the provider's console).
- **The jail catches nothing**: check `sudo systemctl status fail2ban` and see whether `backend` matches where sshd actually writes its logs. If you changed the SSH port, remember to set `port`.
- **A wrong configuration stops the service from starting**: read the error with `sudo journalctl -u fail2ban -e`.
- **Believing fail2ban is enough**: it is not. It only slows down someone guessing passwords; the foundation remains SSH keys and turning passwords off.

Note: this article gives only a minimal configuration. Read the fail2ban documentation before using advanced blocking actions.

## Summary

fail2ban reads the SSH logs and temporarily blocks addresses that fail many times; `journalctl -u ssh`, `last` and `lastb` help you check who has tried and who has got in. Together with SSH keys, a tight `sshd_config` and regular log reading, you get a layered defence for the SSH port.

## References

- [fail2ban-client(1) on Ubuntu 24.04 (noble)](https://manpages.ubuntu.com/manpages/noble/man1/fail2ban-client.1.html)
- [jail.conf(5) on Ubuntu 24.04 (noble)](https://manpages.ubuntu.com/manpages/noble/man5/jail.conf.5.html)
- [OpenSSH server, Ubuntu Server documentation](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
