---
title: Shipping journald logs to Loki with Grafana Alloy: keeping log labels cheap
tags: loki, alloy, journald, logs, labels
type: lab
---

> [!TLDR]
> - Loki stores logs as streams, and every combination of labels is a stream; labels with many distinct values bloat the index and slow queries.
> - Promtail reached end of life on 2 March 2026; replace it with Grafana Alloy, which reads journald through `loki.source.journal`.
> - Keep only a few stable labels such as host and service; leave the rest to filtering at query time.

## Goal

This article ships the journald logs of one or more Ubuntu 24.04 LTS machines to one place, Loki, and lets you view them in Grafana. More important than getting it running is how you choose labels: badly chosen labels are the main reason log systems become slow and expensive. The content was checked against Grafana's official documentation, as of November 2026.

You should know how to read logs on a single machine with `journalctl`, see [[journalctl: filtering logs by service and by time on Ubuntu 24.04]]. This article connects many machines together.

## Preparation

- One machine running Loki (the log machine) and one or more machines whose logs you collect, all Ubuntu 24.04 LTS with `sudo`. For a trial they can be the same machine.
- The collecting machines can reach the log machine on port 3100 (Loki's default HTTP port). In the examples the log machine has the address `192.0.2.10`.
- Grafana installed, following the APT-repository installation in the previous article of this series.

Loki has no built-in authentication. The official documentation advises putting an authenticating reverse proxy (for example nginx) in front of it; do not leave port 3100 open to untrusted networks.

## Steps

### Step 1: install Loki

Add Grafana's APT repository (the key download and `deb` line are the same as in the Grafana installation article), then:

```bash
sudo apt-get update
sudo apt-get install loki
sudo systemctl enable --now loki
curl -s http://localhost:3100/ready
```

The Loki documentation allows installing the `loki` package from this repository, or downloading a binary from the releases page. The `curl` call to `/ready` returns `ready` once Loki is ready (you may need to wait about a minute after starting). The package ships a configuration file for running as a single process; for a real environment, review where data is stored and how long logs are kept. With storage on disk, Loki deletes only according to the retention settings, not when the disk fills up, so you must watch disk space yourself.

### Step 2: why Alloy and not Promtail

Promtail is Loki's older log-collection agent. The official documentation states that Promtail reached end of life (EOL) on 2 March 2026, receives no more updates, and advises moving to Grafana Alloy or another supported client. So every new setup should use Alloy. If you already use Promtail, the Alloy documentation has a tool that converts a Promtail configuration into an Alloy configuration.

### Step 3: install Alloy on the machines whose logs you collect

```bash
sudo apt install gpg
sudo mkdir -p /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install alloy
```

The service is called `alloy`. The default configuration file is `/etc/alloy/config.alloy`.

### Step 4: write the configuration that collects journald

Open `/etc/alloy/config.alloy` and put in the following (replace the log machine's address as needed):

```alloy
loki.relabel "journal" {
  forward_to = []

  rule {
    source_labels = ["__journal__systemd_unit"]
    target_label  = "unit"
  }
}

loki.source.journal "read" {
  forward_to    = [loki.write.local.receiver]
  relabel_rules = loki.relabel.journal.rules
  labels        = { host = "may-01", job = "journald" }
}

loki.write "local" {
  endpoint {
    url = "http://192.0.2.10:3100/loki/api/v1/push"
  }
}
```

What each block does:

- `loki.source.journal` reads journald (by default from `/var/log/journal` and `/run/log/journal`) and passes the lines to the receivers listed in `forward_to`. The `max_age` option defaults to 7 hours: Alloy reads only entries up to that age, counted from when the process starts.
- Every journald field becomes an internal label named `__journal_FIELDNAME`. The field `_systemd_unit` has a leading underscore, so its label has two underscores after `__journal`. Labels starting with `__` are dropped before sending, so the `loki.relabel` block renames it to a `unit` label to keep it.
- `labels` attaches fixed labels to every log line: here the machine name (`host`) and `job`.
- `loki.write` sends the logs to Loki's push address.

Apply the configuration:

```bash
sudo systemctl enable --now alloy
sudo systemctl reload alloy
sudo journalctl -u alloy -n 20
```

After editing the configuration file, `systemctl reload alloy` is enough for Alloy to reload it. If the `alloy` log says it cannot read the journal, check the permissions of the account running Alloy: to read the journal, the account usually needs to belong to the `systemd-journal` group.

### Step 5: add the Loki data source in Grafana

In Grafana go to **Connections** → **Add new connection**, choose **Loki**, enter the URL `http://192.0.2.10:3100` (or `http://localhost:3100` on the same machine), and click **Save & test**. Then open **Explore**, pick the Loki source and run a simple query:

```logql
{job="journald", unit="ssh.service"}
```

## Labels: how to keep them cheap

This is the part people most often get wrong. Loki indexes only labels, not the content of log lines. Every combination of label values creates a separate stream. According to the official guidance:

- Static labels with clearly bounded values (environment, cluster, host, application) are a good fit.
- Use dynamic labels sparingly. Many streams make the index larger and the data chunks smaller, which hurts performance. Keep the number of values to tens or fewer.
- Do not use short-lived values such as trace IDs or order IDs as labels.
- Do not add a label before you need it: a content filter such as `|= "text"` is often already fast enough.
- Values that almost never repeat (like a `requestId`) do not belong in labels; filter on them at query time.

Applied here: `host`, `job` and `unit` are a reasonable set, because the number of values is bounded by the number of machines and services. Avoid copying every journald field into a label (such as the process ID, PID), because PIDs change constantly and would create countless streams. You can check which streams and labels exist with the Series API or `logcli series --analyze-labels`.

## Checking

- `curl -s http://192.0.2.10:3100/ready` from the collecting machine returns `ready`.
- `systemctl is-active alloy` returns `active` and `journalctl -u alloy` shows no send errors.
- The query `{job="journald"}` in Explore returns recent log lines carrying the `unit` label.

## Common problems

- **No logs arrive:** check the `loki.write` URL, the firewall towards port 3100, and permission to read the journal.
- **Only old logs, or logs missing:** remember the default `max_age` is 7 hours.
- **Slow queries, Loki using a lot of memory:** usually too many labels, or labels with too many values.
- **The `unit` label does not appear:** the source label name is wrong; it must be `__journal__systemd_unit` with two underscores.

## Summary

Centralised logging needs three pieces: Loki to store, Alloy to collect (replacing the end-of-life Promtail) and Grafana to view. Success or failure lies in the labels: few, stable and with bounded values; leave the rest to query-time filters. Once logs are in Loki, the next step is knowing how to ask it questions: see [[LogQL basics and log-based alerts: when to use metrics instead of logs]].

## References

- [Install Loki locally](https://grafana.com/docs/loki/latest/setup/install/local/)
- [Install Grafana Alloy on Linux](https://grafana.com/docs/alloy/latest/set-up/install/linux/)
- [Configure Alloy on Linux](https://grafana.com/docs/alloy/latest/configure/linux/)
- [The loki.source.journal component](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.journal/)
- [The loki.write component](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/)
- [Loki label best practices](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/)
- [Promtail has reached end of life](https://grafana.com/docs/loki/latest/send-data/promtail/)
