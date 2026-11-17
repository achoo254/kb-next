---
title: journalctl: filtering logs by service and by time on Ubuntu 24.04
tags: journalctl, logs, systemd, ubuntu, troubleshooting
type: lab
---

> [!TLDR]
> - `journalctl -u <service>` shows only one service's logs; `-f` follows live, `-n` limits the number of lines.
> - `--since` and `--until` filter by time range; `-p err` keeps only errors; `-b` limits to one boot.
> - Logs take disk space: check with `--disk-usage` and clean with `--vacuum-time`, and read the warning before cleaning.

## Goal

systemd gathers the logs of every service in one place called the *journal*, and `journalctl` is the tool for reading it. After this article you can filter logs by service, by time and by severity, and you know how to keep the journal's size under control. It continues from [[systemctl on Ubuntu 24.04: enabling, disabling and restarting services and checking their status]]: when `systemctl status` reports an error, `journalctl` tells you why.

## Preparation

- Ubuntu 24.04 LTS (systemd 255) and an account with `sudo`.
- An ordinary user can only read their own logs; to read system logs, use `sudo` or add the account to the `systemd-journal` (or `adm`) group.
- The examples use `systemd-resolved` (built in) and `hello` (a service you wrote). Replace them with your own service.
- By default `journalctl` opens a scrolling pager: press `q` to quit, or add `--no-pager`.

## Steps

### Step 1: View one service's logs

```bash
sudo journalctl -u systemd-resolved
```

The `-u` (`--unit`) flag filters by unit name. You can repeat the flag to see several services on the same timeline, for example `-u hello -u systemd-resolved`.

### Step 2: Limit the lines and follow live

```bash
sudo journalctl -u hello -n 50
sudo journalctl -u hello -f
```

`-n 50` shows only the last 50 lines. `-f` (`--follow`) keeps the screen open and prints new lines as they appear, like `tail -f`; press `Ctrl+C` to stop. This is very useful: keep one window running `-f`, run `systemctl restart hello` in the other, and watch what happens.

To see the newest line at the top, add `-r` (`--reverse`).

### Step 3: Filter by time

```bash
sudo journalctl -u hello --since "1 hour ago"
sudo journalctl -u hello --since "2026-11-01 08:00:00" --until "2026-11-01 09:00:00"
sudo journalctl --since yesterday --until today
```

`--since` (`-S`) and `--until` (`-U`) accept dates and times in the form `YYYY-MM-DD HH:MM:SS` or relative phrases such as `"1 hour ago"`, `yesterday`, `today`. Times are shown in the machine's time zone; add `--utc` if you want UTC.

### Step 4: Filter by severity

```bash
sudo journalctl -u hello -p err
sudo journalctl -p warning -b
```

`-p` (`--priority`) filters by level: `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug`. When you name one level, the result includes that level and the more severe ones. So `-p err` gives errors and worse, very handy for a quick scan.

### Step 5: Limit to one boot

```bash
sudo journalctl -b
sudo journalctl -b -1
sudo journalctl --list-boots
```

`-b` is the current boot, `-b -1` is the one just before it. You can only see older boots when the journal is stored persistently on disk (the `/var/log/journal` directory exists); if the journal lives only in memory, it is lost on reboot. `--list-boots` shows which boots still have logs.

### Step 6: Search by keyword and view kernel logs

```bash
sudo journalctl -u hello -g "timeout"
sudo journalctl -k
```

`-g` (`--grep`) filters by a pattern in the message text; `-k` (`--dmesg`) shows only the Linux kernel's log of the current boot, replacing the `dmesg` command.

### Step 7: Control disk usage

```bash
journalctl --disk-usage
sudo journalctl --vacuum-time=2weeks
sudo journalctl --vacuum-size=500M
```

`--disk-usage` tells you how much space the logs take. The two `--vacuum-*` commands **permanently delete** old journal files (by age or by total size) and cannot be undone. Run them only when you are sure you do not need to keep those logs for an investigation; if in doubt, back them up first. To set a lasting limit instead of cleaning by hand, look at options such as `SystemMaxUse=` in the `journald.conf` configuration file.

## Check

A quick self-test: restart `hello`, then view its logs for the last 5 minutes.

```bash
sudo systemctl restart hello
sudo journalctl -u hello --since "5 minutes ago" --no-pager
```

If you see lines recording the stop and the start ("Stopping", "Started"), you have read the service's logs correctly. You can also combine `-u`, `-p err` and `--since` in one command to narrow things down as far as possible.

The journal is also useful for network diagnosis: if you have just used the tools in [[Checking network connectivity on Ubuntu with ip, ss, ping and tracepath]] and still cannot tell why a domain name does not resolve, try `sudo journalctl -u systemd-resolved --since "10 minutes ago"` to see what the name resolution service reports.

## Common mistakes

- **You see nothing, or only your own logs:** you are missing `sudo` or the `systemd-journal` group.
- **`-b -1` reports no data:** the journal is not stored persistently, so only the current boot's logs exist.
- **The service name does not match:** check with `systemctl list-units --type=service`; the right name usually ends in `.service`.
- **A gap in the time range:** `--since`/`--until` use the machine's time zone; try `--utc` to compare.
- **Cleaning too aggressively:** `--vacuum-*` cannot be undone, so choose moderate values.

## Summary

`journalctl -u` picks the service, `-n` and `-f` pick how to read, `--since`/`--until` pick the time, `-p` picks the severity, `-b` picks the boot. Combine these flags and you will find the cause of a problem much faster than by opening log files one by one, and remember to manage the journal's size so the disk does not fill up.

## References

- [journalctl — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html)
- [journald.conf — freedesktop.org](https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html)
- [journalctl(1) — Ubuntu 24.04 manpages](https://manpages.ubuntu.com/manpages/noble/man1/journalctl.1.html)
