---
title: LogQL basics and log-based alerts: when to use metrics instead of logs
tags: logql, loki, alerting, logs, metrics
type: note
---

> [!TLDR]
> - A LogQL query is a stream selector on labels followed by line filters; put the line filters first in the pipeline so it runs fast.
> - Wrapping a query in `rate` or `count_over_time` produces numbers, which you can chart or alert on.
> - Anything you can measure directly should be a metric; logs are for detail and rare events.

## Introduction

Collecting logs in one place is not enough; you must be able to ask questions of them. Loki uses a query language called LogQL, which looks much like Prometheus's PromQL. This article introduces the basic syntax, how to turn logs into numbers, how to set alerts from logs and, most importantly, when not to. The content was checked against Grafana's official documentation, as of November 2026.

The article assumes logs are already in Loki as in the previous article of this series (Loki and Grafana Alloy), with the labels `host`, `job` and `unit`.

## Stream selectors and line filters

Every log query starts with a stream selector in curly braces, made of `label="value"` pairs separated by commas:

```logql
{job="journald", unit="ssh.service"}
```

The label matching operators are `=`, `!=`, `=~` (matches a regular expression) and `!~` (does not match). A regular expression in a stream selector must match the whole label value.

After the selector you filter the content of each line with four operators:

- `|=` the line contains the string;
- `!=` the line does not contain the string;
- `|~` the line matches the regular expression;
- `!~` the line does not match the regular expression.

```logql
{job="journald", unit="ssh.service"} |= "Failed" != "invalid user"
```

Regular expressions in line filters are not anchored at both ends, and are case-sensitive unless you add the prefix `(?i)`. Filters can be chained. The documentation recommends putting line filters at the start of the pipeline, because later stages then run only on lines that passed the filter, which is faster.

This is also why the previous article advised few labels: a narrow selector plus a line filter is often fast enough without adding labels.

## Parsing structured log lines

If log lines are JSON or logfmt, you can extract fields:

```logql
{job="app"} | json
{job="app"} | logfmt
```

`| json` with no parameters extracts every JSON property as a temporary label (nested keys are joined with underscores); with parameters it extracts only the fields you name. `| logfmt` does the same for `key=value` lines. If a parser meets a malformed line, the line is kept and gets an extra `__error__` label. After extraction you can filter by field, for example `| duration > 10s`.

An important point: temporary labels produced by `json` or `logfmt` exist only inside the query and do not grow the index. That is the right way to filter on values with many variants without turning them into labels.

## Turning logs into numbers

Wrap a log query in a function over a time range and you get metrics:

- `count_over_time(...)`: counts lines in the time range;
- `rate(...)`: lines per second;
- `bytes_rate(...)`: bytes per second.

```logql
count_over_time({job="journald", unit="ssh.service"} |= "Failed" [5m])
sum by (host) (rate({job="journald"} |= "error" [5m]))
```

The range can go right after the stream selector or at the end of the pipeline. If you know PromQL's `sum by`, grouping by label here works the same way; revisit [[PromQL basics: counters, gauges, rate and sum by, with CPU, RAM and disk examples]] if needed. The results can be charted in Grafana like any other metric.

## Alerting from logs

Loki has a ruler component that continually runs configured queries and acts on the results. Alerting rules use the same format as Prometheus, except that the `expr` expression is written in LogQL:

```yaml
groups:
  - name: example
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate({app="foo", env="production"} |= "error" [5m])) by (job)
            /
          sum(rate({app="foo", env="production"}[5m])) by (job)
            > 0.05
        for: 10m
        labels:
          severity: page
        annotations:
          summary: High share of error lines
```

This rule computes the ratio of lines containing "error" to all lines, and fires an alert if it stays above 5% for 10 minutes. The ruler sends alerts to Alertmanager according to the `alertmanager_url` setting. With local rule storage, each rule file lives in a directory named after the tenant ID; in single-tenant mode the default ID is `fake`. In addition, Grafana has alerts managed by Grafana itself, which the Loki documentation calls the recommended type, and which can query several data sources in one rule.

If you are used to Alertmanager grouping and sending notifications, nothing changes; only the source of the alert is logs rather than metrics.

## When to use metrics, when to use logs

Alerting from logs works, but it is not always the best choice. A practical rule of thumb:

- **Use metrics** for things measured continuously: CPU, memory, disk, requests per second, latency. Metrics are small, cheap, fast to query and stable, because they are numbers from the start.
- **Use logs** for discrete, rare events that need context: one failed login, one specific error from a service, a message the program does not expose as a metric.
- If you find yourself counting a certain kind of log line every day just to alert on it, consider having the program export a metric directly. Counting log lines requires reading much more data and depends on the wording of the line never changing.
- A metric alert tells you there is a problem; logs help you find the cause. The two complement each other; the detailed comparison is in [[Alerting with Prometheus and Alertmanager: how metrics differ from logs]].

## Summary

LogQL consists of a stream selector, line filters (placed first), the `json` and `logfmt` parsers, and functions such as `rate` and `count_over_time` that produce numbers. Loki's ruler lets you set alerts in the Prometheus format using LogQL. Keep alerts for things you can measure with metrics, and use logs for investigation. That way, dashboards in Grafana, logs in Loki and alerts in Alertmanager form one complete observability loop.

## References

- [LogQL log query syntax](https://grafana.com/docs/loki/latest/query/log_queries/)
- [Metric queries from logs](https://grafana.com/docs/loki/latest/query/metric_queries/)
- [Loki alerting and recording rules](https://grafana.com/docs/loki/latest/alert/)
