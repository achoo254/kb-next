---
title: Alerting with Prometheus and Alertmanager: how metrics differ from logs
tags: prometheus, alertmanager, alerting, metrics, logs
type: process
---

> [!TLDR]
> - A metric is a number over time, cheap and good for knowing "is something wrong"; a log records each event and is good for knowing "what is wrong".
> - Prometheus evaluates alerting rules (a PromQL expression plus `for`) and sends alerts to Alertmanager.
> - Alertmanager groups, de-duplicates and routes notifications to receivers such as a webhook; always test by stopping an exporter on purpose.

## Metrics and logs: two kinds of data that complement each other

A **metric** is a number sampled over time: CPU at 80%, 12 thousand requests per minute. It is small, fast to query, and good for charts and alert thresholds. But a metric only says *something is off*; it rarely says why.

A **log** is a detailed record of each event: who called what, which error, when. A log answers "what happened", but reading and storing a lot of logs costs more.

The familiar approach: use metrics to *detect* and alert, then use logs to *investigate*. For example, an alert tells you a service stopped responding; you open that service's log using the filters in [[journalctl: filtering logs by service and by time on Ubuntu 24.04]] to find the reason.

## Goal

Set up an alerting rule in Prometheus, have Alertmanager receive the alert and forward it to a webhook, then test it by making a target stop running. This article uses the queries learned in [[PromQL basics: counters, gauges, rate and sum by, with CPU, RAM and disk examples]].

## Preparation

- Prometheus and node_exporter running; `promtool` available (see the previous two articles).
- Install Alertmanager: download the `alertmanager-*.linux-amd64.tar.gz` file from `https://prometheus.io/download/`, copy the `alertmanager` and `amtool` binaries to `/usr/local/bin`, then create a unit file like the one for Prometheus. Alertmanager listens on port 9093.
- A place to receive notifications for testing. Here we use the placeholder webhook address `http://localhost:5001/alerts`; replace it with your own service.

## Steps

### Step 1: write the alerting rules

Create `/etc/prometheus/rules.yml`:

```yaml
groups:
  - name: host
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Target {{ $labels.instance }} is not responding"

      - alert: LowMemory
        expr: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Available RAM on {{ $labels.instance }} is below 10%"
```

Explanation: `alert` is the name; `expr` is a PromQL expression, and any series that produces a result makes the alert "active"; `for` requires the expression to hold continuously for that duration before it "fires" (until then the alert is *pending*), avoiding false alarms from a single blip; `labels` attach labels used for routing; `annotations` are information for human readers and can embed `{{ $labels.label_name }}` and `{{ $value }}` (the value of the expression). The `for: 1m` on `InstanceDown` is for quick testing; real environments usually use a longer duration.

Check the syntax:

```bash
promtool check rules /etc/prometheus/rules.yml
```

### Step 2: connect Prometheus to the rules and to Alertmanager

Add to `/etc/prometheus/prometheus.yml`:

```yaml
rule_files:
  - /etc/prometheus/rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']
```

Check, then reload:

```bash
promtool check config /etc/prometheus/prometheus.yml
sudo systemctl kill -s SIGHUP prometheus
```

### Step 3: configure Alertmanager

Create `/etc/alertmanager/alertmanager.yml`:

```yaml
route:
  receiver: default-webhook
  group_by: [alertname, instance]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: default-webhook
    webhook_configs:
      - url: 'http://localhost:5001/alerts'
        send_resolved: true
```

Meaning: `group_by` bundles alerts with the same labels into one notification, avoiding a flood; `group_wait` is the wait before a group's first notification so related alerts can be gathered; `group_interval` is the gap between notifications when the group changes; `repeat_interval` is how long before repeating while the alert is still unresolved (the values above are the defaults, written out for clarity); `send_resolved` also sends a notification once the problem is over.

Check with the bundled tool, then run:

```bash
amtool check-config /etc/alertmanager/alertmanager.yml
```

On success the command prints `SUCCESS` and a summary of the sections it found. Then start Alertmanager under systemd with `--config.file=/etc/alertmanager/alertmanager.yml`.

## Verification

1. Open `http://localhost:9090/alerts` to see rule states: Inactive, Pending or Firing.
2. Stop node_exporter to simulate an incident: `sudo systemctl stop node_exporter`. Do this only on a test machine.
3. Wait a little over 1 minute: `InstanceDown` moves to Pending and then Firing. After `group_wait`, Alertmanager sends a notification to the webhook. You can also see the alert in the interface at `http://localhost:9093`.
4. Turn it back on with `sudo systemctl start node_exporter`; the alert clears and (thanks to `send_resolved`) you receive a "resolved" notification.

## Common errors

- **No alert even though the expression is right**: `for` may not have elapsed yet, or `rule_files` was not loaded. Run the `expr` on the Graph page to see whether it returns anything.
- **Prometheus sees the alert but no notification arrives**: check that the `alerting` section points to the right Alertmanager address and that Alertmanager is running.
- **Notifications keep flooding in**: `group_by` is too fine-grained or `repeat_interval` is too short.
- **Flapping alerts**: increase `for`, or use `rate()` with a longer range instead of `irate()`.
- **Exposing Alertmanager to the internet without authentication**: its interface lets people create "silences" (muting alerts), so restrict access.

## Summary

Metrics let you know early that something is wrong; logs let you understand what. Prometheus evaluates rules with `for` to avoid false alarms; Alertmanager handles grouping, de-duplication and delivery to receivers. Always test with a controlled incident to be sure notifications really arrive.

## References

- Prometheus: [Alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- Prometheus: [Alertmanager configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- Prometheus: [Alertmanager overview](https://prometheus.io/docs/alerting/latest/alertmanager/)
- Prometheus: [Recording rules best practices](https://prometheus.io/docs/practices/rules/)
