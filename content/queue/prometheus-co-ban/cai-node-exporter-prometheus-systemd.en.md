---
title: Installing node_exporter and Prometheus on Ubuntu 24.04 as systemd services
tags: prometheus, node_exporter, systemd, ubuntu, monitoring
type: lab
---

> [!TLDR]
> - node_exporter measures the health of the machine (CPU, RAM, disk, network) and exposes it on port 9100; Prometheus periodically comes to "pull" those measurements.
> - Both programs are standalone binaries; we create dedicated users and write unit files so systemd starts them at boot and restarts them on failure.
> - Verify with `curl` on port 9100 and the Targets page on port 9090: every target must be UP.

## Goal

After this article you will have an Ubuntu 24.04 LTS machine running two services: **node_exporter** (which provides measurements of that machine) and **Prometheus** (which collects, stores and lets you query them). Both run under systemd, so they start at boot and restart automatically when they stop abnormally.

Prometheus works on a *pull* model: instead of programs pushing measurements out, Prometheus actively makes an HTTP call to the `/metrics` address of each "target" on a schedule, for example every 15 seconds. The thing that serves `/metrics` is called an **exporter**. node_exporter is the official exporter for Linux operating system metrics.

If unit files are new to you, read [[systemd and unit files on Ubuntu 24.04: how services are described and started]] first; this article uses exactly those concepts.

## Preparation

- An Ubuntu 24.04 LTS machine, an account with `sudo`, and internet access to download files.
- Ports 9100 (node_exporter) and 9090 (Prometheus) not used by another program. In this article both only need to be reachable from the machine itself (`localhost`).
- Open the official release pages to choose versions: node_exporter at `https://github.com/prometheus/node_exporter/releases` and Prometheus at `https://prometheus.io/download/`. This article uses node_exporter 1.10.2, as in the official guide; for Prometheus, replace `PROM_VERSION` with the version number you choose (for example written as `3.x.y`, without the leading `v`).

The platform is `linux-amd64`. If the machine is ARM, the download file will say `linux-arm64`; check with `uname -m` (`x86_64` means amd64, `aarch64` means arm64).

## Steps

### Step 1: create system users that cannot log in

Running services as dedicated users limits the damage if a program is abused:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin node_exporter
sudo useradd --system --no-create-home --shell /usr/sbin/nologin prometheus
```

### Step 2: download and install node_exporter

```bash
cd /tmp
wget https://github.com/prometheus/node_exporter/releases/download/v1.10.2/node_exporter-1.10.2.linux-amd64.tar.gz
tar xvfz node_exporter-1.10.2.linux-amd64.tar.gz
sudo install -o root -g root -m 0755 node_exporter-1.10.2.linux-amd64/node_exporter /usr/local/bin/node_exporter
```

The release page includes a checksum file, `sha256sums.txt`; compare it with `sha256sum` before installing.

### Step 3: write the node_exporter unit file

Create `/etc/systemd/system/node_exporter.service`:

```ini
[Unit]
Description=Prometheus node_exporter
After=network-online.target
Wants=network-online.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

A short explanation: `User=` chooses the user to run as; `ExecStart=` is the start command; `Restart=on-failure` tells systemd to run the program again when it exits with an error; `WantedBy=multi-user.target` makes the service start with the machine once you `enable` it.

Reload the configuration and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
systemctl status node_exporter --no-pager
```

### Step 4: download and install Prometheus

```bash
cd /tmp
wget https://github.com/prometheus/prometheus/releases/download/vPROM_VERSION/prometheus-PROM_VERSION.linux-amd64.tar.gz
tar xvfz prometheus-PROM_VERSION.linux-amd64.tar.gz
cd prometheus-PROM_VERSION.linux-amd64
sudo install -m 0755 prometheus promtool /usr/local/bin/
sudo mkdir -p /etc/prometheus /var/lib/prometheus
sudo chown prometheus:prometheus /var/lib/prometheus
```

`promtool` is the bundled tool for checking configuration and rule files; we use it in later steps.

### Step 5: write the prometheus.yml configuration

Create `/etc/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: node
    static_configs:
      - targets: ['localhost:9100']
```

`scrape_interval` is how often measurements are pulled. Each entry in `scrape_configs` is a "job" with a list of targets. Check the syntax before running:

```bash
promtool check config /etc/prometheus/prometheus.yml
```

### Step 6: the Prometheus unit file

Create `/etc/systemd/system/prometheus.service`:

```ini
[Unit]
Description=Prometheus
After=network-online.target
Wants=network-online.target

[Service]
User=prometheus
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

The `--storage.tsdb.path` flag says where the time-series database is stored (the default is a `./data` directory next to where it runs, which is unsuitable for a service). Enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now prometheus
systemctl status prometheus --no-pager
```

## Verification

1. Look at the machine's raw measurements:

   ```bash
   curl -s http://localhost:9100/metrics | grep "node_" | head
   ```

   You will see lines like `node_cpu_seconds_total{...} value`. Each line is one time series: a metric name, labels in curly braces, and a value.

2. Open a browser at `http://localhost:9090/targets` (or go to **Status > Target health**). The target in the `node` job must show **UP**. For a remote server, use an SSH tunnel or a proxy rather than exposing the port directly to the internet.

3. In the query box at `http://localhost:9090/graph`, enter `up` and click Execute. The `up` metric is created by Prometheus itself for every target: a value of 1 means the latest scrape succeeded, 0 means it failed. This is the simplest way to know whether an exporter is alive.

4. To reload the configuration after editing `prometheus.yml` without restarting, send the SIGHUP signal: `sudo systemctl kill -s SIGHUP prometheus`.

## Common errors

- **Target shows DOWN**: check that node_exporter is still running (`systemctl status node_exporter`) and on the right port. Try a manual `curl` to the target address from the machine running Prometheus.
- **Prometheus does not start and reports a permission error**: `/var/lib/prometheus` must belong to the `prometheus` user (step 4). See the details with `journalctl -u prometheus -e`; how to filter logs is explained in [[journalctl: filtering logs by service and by time on Ubuntu 24.04]].
- **YAML syntax error**: YAML is sensitive to indentation; use spaces only, never tabs. `promtool check config` will point to the faulty line.
- **Editing a unit file has no effect**: you forgot `sudo systemctl daemon-reload`.
- **Exposing port 9100 or 9090 to the internet**: these ports have no authentication by default, so do not open them publicly; restrict them with a firewall or put them behind an authenticating proxy.

## Summary

Install two standalone binaries, create dedicated users, describe them with unit files and let systemd handle the rest. node_exporter exposes measurements on port 9100, Prometheus pulls them every 15 seconds and lets you view them on port 9090. With data in place, the next step is learning to ask questions of it with PromQL.

## References

- Prometheus: [Monitoring Linux host metrics with the Node Exporter](https://prometheus.io/docs/guides/node-exporter/)
- Prometheus: [Getting started](https://prometheus.io/docs/prometheus/latest/getting_started/)
- Prometheus: [Download](https://prometheus.io/download/)
- Prometheus: [Jobs and instances (metric `up`)](https://prometheus.io/docs/concepts/jobs_instances/)
