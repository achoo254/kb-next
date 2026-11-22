---
title: Zero-downtime deployment and rollback in a pipeline: rolling, blue/green and canary
tags: deployment, rolling update, blue/green, canary, rollback
type: note
---

> [!TLDR]
> - Zero-downtime deployment means users see no errors or interruptions while you roll out a new version.
> - Three common strategies: rolling (replace gradually), blue/green (two parallel environments, switch traffic), canary (let a small share of users try it first).
> - Rollback is fast and safe only when the old version is preserved (an artifact or an image with a fixed tag) and database changes are backward compatible.

## Introduction

The pipeline has built and tested the code, and the last step is deploy. If deploying means "stop the old version, start the new one", the application serves nobody between those two actions. If the new version is faulty, you have to start over, which is both slow and stressful.

This article explains three deployment strategies that avoid downtime, and how to prepare so you can roll back immediately when something goes wrong. The basics of artifacts and a first pipeline are covered in the two earlier articles of this series.

## Rolling: replace one version at a time

Suppose the application runs on four instances behind a load balancer. With a **rolling update**, the system replaces one instance or a small group at a time: start a new one, wait until it is ready, then stop an old one, and repeat until all four run the new version.

- **Advantages**: simple, no need to double the resources, and the default on many platforms.
- **Keep in mind**: during the replacement the old and new versions run at the same time, so both must work with the shared data and API.
- **Requirement**: the load balancer must send requests only to instances that are *ready*, so the application needs a trustworthy health check.

Kubernetes uses a rolling update as the default strategy of a Deployment. You can read how it works in detail, with its parameters, in [[Kubernetes Deployments and rolling updates: updating your app without downtime]].

## Blue/green: two parallel environments

With **blue/green** you have two identical environments: "blue" is serving users and "green" is where you set up the new version. After checking green, you switch all traffic from blue to green, usually by changing the load balancer configuration or a routing record.

- **Advantages**: the switch is nearly instant, and rolling back is just switching traffic back to blue, where the old version is still intact.
- **Disadvantages**: you need resources for two environments during the switch; a shared database is still the hard part (see below).

Martin Fowler describes this pattern briefly in his BlueGreenDeployment article listed in the References.

## Canary: try with a small share first

**Canary** is named after the canary birds once used to warn of toxic gas in mines. You give the new version a small share of the traffic, for example a few percent of users, and watch errors, latency and other metrics. If it looks fine you raise the share until it reaches 100%, and if not you pull back to the old version, with only that small group of users affected.

- **Advantages**: limits the blast radius of a faulty release.
- **Disadvantages**: it needs the ability to split traffic by proportion and good monitoring to tell whether the new version is "fine". Without metrics, a canary is just a slow rolling update.

## Preparing to roll back

Any strategy is pointless if you cannot roll back. There are three conditions:

1. **Keep the old version intact.** Every release must be an artifact or an image with a fixed tag (for example by commit hash or version number), never overwritten. Avoid relying on the `latest` tag alone, because it does not tell you which version the "old" one was. Rolling back then simply means redeploying the stored version, and the pipeline should allow rerunning the deploy step with a specified version.
2. **Rollback must be tested before you need it.** Rehearse it regularly in a staging environment. For Kubernetes, the rollback command is covered in [[Rolling back on Kubernetes with kubectl rollout undo]].
3. **Database changes must be backward compatible.** This is the part most easily forgotten. If the new version dropped a column that the old version still needs, rolling back will fail even though the code is back. The safe approach is often called *parallel change* or *expand/contract*: first **expand** (add the new column or table while keeping the old one), deploy code that works with both, move everything to the new one, and only in a later release **contract** (remove the old one). Every step can be rolled back.

## Putting it into the pipeline

A safe deploy in a pipeline usually has these components:

- **Environments**: both GitHub Actions and GitLab CI have the concept of an environment, to track deployment history and set per-environment rules.
- **Manual approval** before production, if the team follows the Continuous Delivery model.
- **Run sequentially, not in parallel**: two overlapping deploys to the same environment easily cause chaos. GitHub Actions has `concurrency`, and GitLab CI has the `resource_group` resource for this purpose.
- **Post-deploy checks (smoke tests)**: a few simple test requests to confirm the application answers correctly. If they fail, the pipeline triggers a rollback automatically.

## Summary

Zero-downtime deployment needs no magic, only the right strategy and a prepared way back. Rolling replaces gradually and suits most cases; blue/green allows an instant switch and rollback but costs resources; canary reduces risk but demands good monitoring. Whichever you choose, keep old releases intact, rehearse rollbacks and change the database in compatible steps.

## References

- Martin Fowler, BlueGreenDeployment: https://martinfowler.com/bliki/BlueGreenDeployment.html
- Martin Fowler, CanaryRelease: https://martinfowler.com/bliki/CanaryRelease.html
- Martin Fowler, ParallelChange: https://martinfowler.com/bliki/ParallelChange.html
- Kubernetes Docs, Deployments: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- GitHub Docs, Managing environments for deployment: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment
- GitLab Docs, Environments: https://docs.gitlab.com/ci/environments/
