---
title: sshd_config settings to change on Ubuntu 24.04: disabling root login, restricting users and the question of changing the port
tags: sshd, sshd_config, ubuntu, security, configuration
type: lab
---

> [!TLDR]
> - Put your settings in their own file under `/etc/ssh/sshd_config.d/`, disable root login and password login, and allow only the users you need.
> - Always run `sshd -t` to check the syntax and test with a new session before closing the old one.
> - Changing the SSH port only reduces log noise; it is not a real security measure.

## Goal

Once you can log in with a key (the first article of this planet), the next step is to tighten the SSH server configuration. This article uses OpenSSH 9.6 on Ubuntu 24.04 LTS and changes the most useful settings, explaining why each one matters.

## Preparation

- You can already log in with a key to an ordinary account that has `sudo` rights.
- **Open a second SSH session and leave it open** throughout. If the configuration is wrong, this session lets you fix it without being locked out of the server.
- If the server is remote and SSH is your only way in, be especially careful at every step below.

## Steps

### Step 1: Use your own file in sshd_config.d

The main file `/etc/ssh/sshd_config` on Ubuntu 24.04 has the line `Include /etc/ssh/sshd_config.d/*.conf` near the top. So you do not need to edit the original file: create your own, which is easy to track and is not overwritten when packages are upgraded.

One thing to remember: for most settings sshd uses the **first** value it reads, and `.conf` files are read in name order. Some cloud server images ship a file such as `50-cloud-init.conf` that sets `PasswordAuthentication yes`. So give your file a lower number, for example `10-hardening.conf`, so that your value wins.

```bash
sudo nano /etc/ssh/sshd_config.d/10-hardening.conf
```

Example contents:

```text
# Do not let root log in directly
PermitRootLogin no

# Keys only, passwords off
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes

# Only these users may log in (replace with your real name)
AllowUsers deploy

# Limit attempts and waiting time
MaxAuthTries 3
LoginGraceTime 30
```

What each setting means:

- `PermitRootLogin no`: the `root` account has a fixed name everyone knows, so it is target number one. OpenSSH's default is `prohibit-password` (root can log in only with a key); `no` blocks it completely, so you log in with an ordinary account and use `sudo`.
- `PasswordAuthentication no` and `KbdInteractiveAuthentication no`: turn off both password login paths. Enable them only after you have checked that your key works.
- `AllowUsers`: an allow list. A user who is not on the list cannot log in, even with the right password or key.
- `MaxAuthTries`: the maximum number of authentication attempts per connection (default 6). `LoginGraceTime`: the maximum time to complete login (default 120 seconds).

### Step 2: Check the syntax before applying

```bash
sudo sshd -t
```

No output means the syntax is valid. To see the values that are actually in effect (after merging all files):

```bash
sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|allowusers|maxauthtries'
```

### Step 3: Reload the service and test with a new session

On Ubuntu the service is called `ssh`:

```bash
sudo systemctl reload ssh
```

Then **open a new terminal window** and log in. Only when the new session works should you close the old one. Sessions that are already open are not cut when the configuration is reloaded.

## Changing the port: is it worth it?

Many people move port 22 to another port (for example 2222). In practice, network scanners scan the whole range of ports, so changing the port does not stop anyone determined to attack. The benefit is real but small: your logs get less noisy because automated probes only try port 22. A port change does not replace SSH keys, turning passwords off, or a firewall.

If you still want to change it, do it in the right order so you do not lock yourself out:

1. Open the new port on the firewall first (and keep port 22 until you have finished testing).
2. Add `Port 2222` to the configuration file. On Ubuntu 24.04, sshd is started through `ssh.socket` (activated on connection), so after changing the port run `sudo systemctl daemon-reload` and then `sudo systemctl restart ssh.socket`.
3. Check which port is listening with `sudo ss -tlnp | grep -E 'sshd|ssh'`.
4. Test with `ssh -o Port=2222 -l deploy example.com` from a new session, and only then close port 22.

## Checking

- `sudo sshd -T` shows the values you want.
- Key login to an account listed in `AllowUsers` succeeds.
- `ssh -l root example.com` is refused; trying with `-o PubkeyAuthentication=no` is also refused because passwords are off.

## Common errors

- **Locking yourself out of the server**: caused by turning passwords off before the key works, or by `AllowUsers` missing your own name. Always keep the old session and test with a new one. For a virtual machine, the provider's console is usually a rescue way in.
- **The configuration has no effect**: a `.conf` file with a lower number sets a different value. Use `sshd -T` to see the final value and `grep -r PasswordAuthentication /etc/ssh/` to find who set it.
- **Port change seems to do nothing**: you forgot `daemon-reload` and restarting `ssh.socket`, or the firewall has not opened the new port.

## Summary

Put your configuration in its own file in `sshd_config.d`, disable root and password login, limit users with `AllowUsers`, check with `sshd -t` and always test with a new session. Changing the port is only a minor detail. The last step is to block those who keep guessing, see [[Blocking SSH password guessing with fail2ban and reading login logs on Ubuntu 24.04]].

## References

- [sshd_config(5), OpenBSD manual](https://man.openbsd.org/sshd_config)
- [sshd_config(5) on Ubuntu 24.04 (noble)](https://manpages.ubuntu.com/manpages/noble/man5/sshd_config.5.html)
- [OpenSSH server, Ubuntu Server documentation](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
- [sshd now uses socket-based activation on Ubuntu](https://discourse.ubuntu.com/t/sshd-now-uses-socket-based-activation-ubuntu-22-10-and-later/30189)
