---
title: SSH keys instead of passwords on Ubuntu 24.04: creating, installing and testing an ed25519 key
tags: ssh, ssh keys, ed25519, ubuntu, security
type: lab
---

> [!TLDR]
> - An SSH key pair has a private key (kept secret) and a public key (placed on the server), and it is far harder to guess than a password.
> - Create it with `ssh-keygen -t ed25519`, set a passphrase, then put the public key on the server with `ssh-copy-id`.
> - Confirm that key login works before you turn off passwords in the next step.

## Goal

By the end of this article you will log in to an Ubuntu 24.04 LTS server with an SSH key instead of a password. The article uses OpenSSH 9.6 (the version shipped with Ubuntu 24.04). The addresses are examples only: `example.com` and a user called `deploy`.

Why give up passwords? Any server with an SSH port open to the Internet is probed constantly by automated programs guessing passwords. A password can be guessed, leaked or reused somewhere else. An SSH key works differently: the server keeps only the public key, while the private key stays on your machine and is never sent anywhere. When you log in, your machine proves that it holds the private key without revealing it.

## Preparation

- An Ubuntu 24.04 server with `openssh-server` installed and an ordinary account (here `deploy`) that can currently log in with a password.
- Your own machine (Linux, macOS, or Windows with OpenSSH) with the `ssh-keygen` command.
- It is wise to keep an old SSH session to the server open as a fallback in case something goes wrong.

## Steps

### Step 1: Create the key pair on your machine

```bash
ssh-keygen -t ed25519 -C "my-laptop"
```

The command asks where to save the key (default `~/.ssh/id_ed25519`) and then asks for a passphrase. Do set a passphrase: if someone gets hold of the private key file, they still cannot use it without knowing this phrase. The option `-t ed25519` selects the Ed25519 algorithm, which is modern, has short keys and has long been supported by OpenSSH. The option `-C` is just a comment so you can recognise the key.

The result is two files: `~/.ssh/id_ed25519` (the private key) and `~/.ssh/id_ed25519.pub` (the public key).

### Step 2: Put the public key on the server

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@example.com
```

The command asks for the password one last time, then appends the public key to the file `~/.ssh/authorized_keys` of the user `deploy` on the server. It only adds a key and deletes nothing.

If your machine has no `ssh-copy-id`, you can do it by hand: paste the contents of the `.pub` file at the end of `~/.ssh/authorized_keys` on the server, one key per line. Paste only the public key (the `.pub` file), never the private key.

### Step 3: Check directory permissions on the server

OpenSSH refuses a key if its directory is too open. On the server, set:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Step 4: Use ssh-agent so you do not retype the passphrase

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

`ssh-agent` keeps the unlocked key in memory for the session, so you enter the passphrase only once. Many desktop environments already run an agent.

## Checking

Open a new terminal window and log in, forbidding the client from using a password:

```bash
ssh -o PasswordAuthentication=no -l deploy example.com
```

If you get in, the key works. To see the details, add `-v`: you will see a line telling you which key the server accepted. Only when this step succeeds should you move on to turning passwords off, which is covered in [[sshd_config settings to change on Ubuntu 24.04: disabling root login, restricting users and the question of changing the port]].

## Common errors

- **`Permission denied (publickey)`**: the server does not accept the key. Check the permissions of `~/.ssh` (700) and `authorized_keys` (600), and make sure you are logging in to the right account. Run `ssh -v` to see which keys your machine tried.
- **Asked for the passphrase every time**: you have not run `ssh-add`, or the agent is not running.
- **Lost the private key**: there is no way to recover it. So install at least two keys (for example a backup key stored safely) before turning passwords off.
- **Private key exposed** (committed to a repository by mistake, sent over chat): treat it as compromised. Remove the matching public key line from `authorized_keys` and create a new key. How to handle secrets in repositories is explained in [[Secrets in code repositories and CI/CD: never commit keys, scan for leaks and rotate on exposure]].

Safety note: `ssh-keygen` overwrites an old key if you pick the same file name (it asks for confirmation). Do not answer "y" if the old key is still in use.

## Summary

An SSH key replaces an easily guessed secret with a mathematical key pair: the public key on the server, the private key on your machine. Create an ed25519 key with a passphrase, put the public key on the server with `ssh-copy-id`, keep the directory permissions correct, and always confirm that key login works before turning passwords off.

## References

- [ssh-keygen(1), OpenBSD manual](https://man.openbsd.org/ssh-keygen)
- [ssh-agent(1), OpenBSD manual](https://man.openbsd.org/ssh-agent)
- [OpenSSH server, Ubuntu Server documentation](https://documentation.ubuntu.com/server/how-to/security/openssh-server/)
