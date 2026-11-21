---
title: PromQL basics: counters, gauges, rate and sum by, with CPU, RAM and disk examples
tags: prometheus, promql, node_exporter, counter, gauge
type: note
---

> [!TLDR]
> - A counter only goes up (and may drop to 0 on restart), so wrap it in `rate()`; a gauge moves up and down freely, so use it directly.
> - `sum by (...)` and `avg by (...)` merge many time series by the labels you choose.
> - Three node_exporter examples: percentage of CPU in use, RAM still available, free disk space.

## Introduction

PromQL is the query language of Prometheus. It is not like SQL: you write an expression, and the result is a set of time series. This article assumes you already have Prometheus pulling measurements from node_exporter as in [[Installing node_exporter and Prometheus on Ubuntu 24.04 as systemd services]]. Open `http://localhost:9090/graph` and try each expression below.

## Time series and labels

A time series consists of a metric name and labels, for example `node_filesystem_avail_bytes{device="/dev/sda1", mountpoint="/"}`. The name and labels identify the series; Prometheus stores its values over time.

Writing a bare metric name, like `node_load1`, returns an **instant vector**: each series has exactly one value, the most recent sample at query time (provided that sample falls within the lookback period, 5 minutes by default). Adding a duration in square brackets, as in `node_cpu_seconds_total[5m]`, returns a **range vector**: for each series, a run of values over the last 5 minutes. A range vector cannot be graphed directly; it exists to be fed into functions such as `rate()`.

Label filters go in curly braces:

- `=` matches exactly, `!=` is not equal;
- `=~` matches a regular expression, `!~` does not match. Regular expressions are always anchored at both ends, so `mode=~"idle"` means `^idle$`.

Example: `node_cpu_seconds_total{mode="idle"}`.

## Counters and gauges

The two kinds of metric you meet most often:

- A **counter** is a cumulative value that only increases; when the process restarts it may drop to 0. Examples: `node_cpu_seconds_total` (total seconds of CPU time spent in each mode), `node_network_receive_bytes_total` (total bytes received). Counter names usually end in `_total`. The absolute value of a counter is rarely meaningful; what we care about is its *rate of increase*.
- A **gauge** is a number that moves up and down freely, such as temperature or free RAM. Examples: `node_memory_MemAvailable_bytes`, `node_filesystem_avail_bytes`, `node_load1`. It can be read directly.

There are also histograms and summaries, used to record distributions (such as response times); we do not need them in this article.

### rate: turning a counter into a speed

`rate(v[range])` gives the per-second average rate of increase of a counter over that range, and automatically compensates when the counter resets to 0 after a restart. For example, bytes received per second over the network:

```promql
rate(node_network_receive_bytes_total[5m])
```

A few notes from the official documentation: `irate()` uses only the last two samples and suits graphing fast-moving series; `rate()` is smoother and so suits alerting; `increase()` gives the total increase over the range and is essentially `rate()` multiplied by the number of seconds in the range. Also, always **`rate()` first, aggregate after**: if you sum counters and only then apply rate, Prometheus can no longer detect the counter resets.

The range in `rate` should be several times the scrape interval; with a 15-second interval, `[1m]` or `[5m]` is reasonable.

## Aggregating with sum by and avg by

A metric often has many series (each CPU core, each disk, each machine). Aggregation operators collapse them:

- `sum(...)`: add everything up; `avg(...)`: the average.
- `by (labels)`: keep the listed labels and group by them; `without (labels)`: drop the listed labels and keep the rest.

Example: total bytes received across all network interfaces of each machine:

```promql
sum by (instance) (rate(node_network_receive_bytes_total[5m]))
```

## Example 1: how busy is the CPU, in percent

`node_cpu_seconds_total` has the labels `cpu` (each core) and `mode` (idle, user, system...). The rate of increase for the `idle` mode is the fraction of time that core was idle (0 to 1). Average across each machine's cores, then take the remainder:

```promql
100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))
```

Read it from the inside out: filter on idle mode, compute the rate per core, average per machine, subtract from 1 to get the busy fraction, multiply by 100 for a percentage.

## Example 2: RAM still available

Two gauges: `node_memory_MemAvailable_bytes` (RAM that can be given to new programs) and `node_memory_MemTotal_bytes` (total RAM). The fraction of RAM still usable:

```promql
100 * node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
```

Both sides have the same label set, so the division pairs up series with identical labels. Use `MemAvailable` rather than "free" because Linux uses spare RAM as cache, so low "free" does not necessarily mean a RAM shortage.

## Example 3: free disk space

```promql
100 * node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
    / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}
```

The filter `fstype!~"tmpfs|overlay"` removes virtual filesystems from the result so only real disks remain. To look at one mount point only, add `mountpoint="/"`.

## Verification and common errors

- **Empty result**: check the metric name spelling. Type the first few letters in the query box and the page will suggest names; or look at the list on node_exporter's `/metrics`.
- **"expected type instant vector, got range vector"**: you passed `metric[5m]` where a single value is needed; wrap it in `rate()`.
- **Using `rate` on a gauge**: wrong in meaning; read a gauge directly, or use `avg_over_time()` for a time average.
- **Aggregating before rate**: reverse the order, as explained above.
- **Forgetting the `by` labels**: `sum(...)` without `by` produces a single number, merging every machine.

## Summary

Four ideas let you read most Prometheus queries: a time series is a name plus labels; counters go with `rate()`, gauges are used directly; `sum by`/`avg by` aggregate by label; rate first, aggregate after. The next step is turning these expressions into alerts, as in the next article on alerting with Alertmanager.

## References

- Prometheus: [Querying basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- Prometheus: [Query functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)
- Prometheus: [Metric types](https://prometheus.io/docs/concepts/metric_types/)
- Prometheus: [Monitoring Linux host metrics with the Node Exporter](https://prometheus.io/docs/guides/node-exporter/)
