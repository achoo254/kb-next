---
title: Installing Grafana on Ubuntu 24.04 and building CPU, memory and disk dashboards from Prometheus
tags: grafana, prometheus, dashboard, ubuntu, promql
type: lab
---

> [!TLDR]
> - Grafana draws charts: it does not collect data itself, it reads from a data source such as Prometheus.
> - Install it from Grafana's official APT repository; it runs as the systemd service `grafana-server`, with the web interface on port 3000.
> - Three PromQL queries for CPU, memory and disk are enough for a first server-monitoring dashboard.

## Goal

By the end of this article you have Grafana running on Ubuntu 24.04 LTS, connected to Prometheus, and a dashboard with three charts: percentage of CPU in use, percentage of memory in use and percentage of disk filled. The content was checked against Grafana's official documentation, as of November 2026.

The article assumes Prometheus and `node_exporter` are already running on the machine, as in [[Installing node_exporter and Prometheus on Ubuntu 24.04 as systemd services]]. If `rate` or `sum by` is unfamiliar, read [[PromQL basics: counters, gauges, rate and sum by, with CPU, RAM and disk examples]] first, because this article reuses those queries.

## Preparation

- An Ubuntu 24.04 LTS machine with `sudo` and Internet access.
- Prometheus running at `http://localhost:9090` and scraping `node_exporter`.
- Port 3000 not already used by another program.

Grafana versions change over time. After installing, note your version with `grafana-server --version`, so you know which release you are comparing the documentation against.

## Steps

### Step 1: add the Grafana APT repository

Grafana publishes packages for Debian and Ubuntu through its own repository. The commands below follow the official guide:

```bash
sudo apt-get install -y apt-transport-https wget gnupg
sudo mkdir -p /etc/apt/keyrings
sudo wget -O /etc/apt/keyrings/grafana.asc https://apt.grafana.com/gpg-full.key
sudo chmod 644 /etc/apt/keyrings/grafana.asc
echo "deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
```

The key file `grafana.asc` lets apt verify package signatures, and the `signed-by` option limits that key to this repository only. The `stable` repository holds stable releases; `beta` is for pre-release builds and should not be used on real machines.

### Step 2: install the package and enable the service

```bash
sudo apt-get update
sudo apt-get install grafana
sudo systemctl daemon-reload
sudo systemctl enable --now grafana-server
sudo systemctl status grafana-server
```

The `grafana` package is the open-source (OSS) edition. The service is called `grafana-server`; `enable --now` both enables it at boot and starts it immediately. The state `active (running)` means you are done. If something goes wrong, read the log with `sudo journalctl -u grafana-server`, as practised in [[journalctl: filtering logs by service and by time on Ubuntu 24.04]].

### Step 3: first login

Open a browser at `http://localhost:3000/` (Grafana's default port is 3000). If Grafana runs on another machine, replace `localhost` with that machine's address and open port 3000 only to the people who need it; do not expose it to the Internet without protection. Sign in with the default administrator account described in the installation documentation, and change the password as soon as you are asked to.

### Step 4: add the Prometheus data source

In the interface:

1. Choose **Connections** in the left-hand menu, then **Add new connection**.
2. Search for `Prometheus`, choose **Prometheus data source**, then **Add new data source**.
3. In the **Settings** tab, put `http://localhost:9090` in the **Prometheus server URL** field.
4. Click **Save & test**. A successful result reads "Successfully queried the Prometheus API."

Note: if Grafana runs in a container, `localhost` is that container itself, not the host. Use the name or address of the machine running Prometheus instead. Besides the interface, Grafana can also declare data sources in YAML files (provisioning); data sources defined that way cannot be edited in the interface.

### Step 5: build three charts

Create a new dashboard (**Dashboards** → **New** → **New dashboard** → **Add visualization**), choose the Prometheus data source, and enter each query below in the query box (**Code** mode). Each query is one panel.

**CPU in use (%)**

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

`node_cpu_seconds_total` is a counter of CPU time, split by mode. `rate` turns it into "how many seconds of idle CPU per second", `avg by (instance)` averages the cores, and subtracting from 100 gives the busy share.

**Memory in use (%)**

```promql
100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
```

`MemAvailable` is the operating system's estimate of memory available for new programs, including reclaimable cache, so it reflects reality better than `MemFree`.

**Disk filled (%)**

```promql
100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"})
```

The filter `fstype!~"tmpfs|overlay"` leaves out virtual filesystems you usually do not want to monitor. The panel shows one line per partition.

For each panel, under **Standard options** set the **Unit** to `Percent (0-100)`, give it a clear title such as "CPU in use (%)", and click **Save dashboard** to name the dashboard.

## Checking

- `systemctl is-active grafana-server` returns `active`.
- At the **Save & test** step, Grafana reports that it queried the Prometheus API.
- All three panels show lines rather than "No data". Try generating load (for example, run a CPU-heavy command for a few tens of seconds) and watch the CPU line rise after about a minute, because Prometheus scrapes on an interval.

## Common problems

- **A panel says "No data":** usually a wrong data source URL, or Prometheus is not scraping `node_exporter`. Open Prometheus, go to Targets, and check that the target is UP.
- **Port 3000 is unreachable from another machine:** check the firewall and the address Grafana listens on; `ss -tlnp | grep 3000` shows it.
- **Grafana in a container cannot reach Prometheus:** because of `localhost`; use a service name or an address the container can reach.
- **The disk chart has too many lines:** refine the `fstype` filter or add `mountpoint="/"` to see only the root partition.

## Summary

Grafana is only the display layer: the data lives in Prometheus, and Grafana runs PromQL queries and draws the results. Install from the official APT repository, enable `grafana-server`, add the data source and paste three queries to get a basic monitoring dashboard. Metrics only answer "how is the machine doing"; to learn "why", you need logs, which is the topic of the next article: [[Shipping journald logs to Loki with Grafana Alloy: keeping log labels cheap]].

## References

- [Install Grafana on Debian or Ubuntu](https://grafana.com/docs/grafana/latest/setup-grafana/installation/debian/)
- [Start and enable Grafana with systemd](https://grafana.com/docs/grafana/latest/setup-grafana/start-restart-grafana/)
- [Configure the Prometheus data source in Grafana](https://grafana.com/docs/grafana/latest/datasources/prometheus/configure/)
