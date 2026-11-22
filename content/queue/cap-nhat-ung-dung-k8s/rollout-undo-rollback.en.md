---
title: Rolling back on Kubernetes with kubectl rollout undo
tags: kubernetes, rollback, kubectl, deployment, incident
type: process
---

> [!TLDR]
> - When a new version is broken, `kubectl rollout undo deployment/<name>` returns the Deployment to the previous revision; add `--to-revision=N` to pick a specific point.
> - Kubernetes does not roll back by itself when an update fails: it only stops progressing, and the decision to go back is yours.
> - Only the Pod `template` is restored; the replica count and configuration outside the template are not.

## Introduction

However carefully you test, a new version occasionally fails in production. What matters then is returning to a working state quickly and in a controlled way. A Deployment records the history of updates as revisions, so going back is a single command. This article assumes you already have the `web` Deployment from the article on Deployments and rolling updates.

## Procedure when a new version has a problem

### 1. Notice the problem

After every update, run:

```bash
kubectl -n thu-nghiem rollout status deployment/web --timeout=120s
```

The command succeeds when the rollout completes, and exits with a non-zero code on timeout or when the Deployment exceeds `progressDeadlineSeconds` (default 600 seconds). This is handy in automation: if `rollout status` fails, run the rollback step.

Also look at the Pods, because an application can look "green" to Kubernetes yet be broken in business terms:

```bash
kubectl -n thu-nghiem get pods -l app=web
kubectl -n thu-nghiem describe deployment web
kubectl -n thu-nghiem logs deployment/web --tail=50
```

### 2. See the available revisions

```bash
kubectl -n thu-nghiem rollout history deployment/web
kubectl -n thu-nghiem rollout history deployment/web --revision=2
```

The second command prints the Pod template details of revision 2 (image, environment variables...) so you can be sure you are about to return to the right version. The number of retained revisions is bounded by `revisionHistoryLimit` (default 10). If you set it to 0, you lose the ability to roll back.

### 3. Roll back

To the previous revision:

```bash
kubectl -n thu-nghiem rollout undo deployment/web
```

To a specific revision:

```bash
kubectl -n thu-nghiem rollout undo deployment/web --to-revision=2
```

A rollback is also a rolling update, so it still follows `maxSurge` and `maxUnavailable` and does not interrupt the service. Watch it with `kubectl rollout status` as usual.

### 4. Record and investigate

Once things are stable, record the reason so others understand the history:

```bash
kubectl -n thu-nghiem annotate deployment/web \
  kubernetes.io/change-cause="rollback to 1.26 due to a bug in 1.27" --overwrite
```

Then investigate the root cause of the faulty version in a test environment, not in the one serving users.

## Verification

- `kubectl -n thu-nghiem rollout history deployment/web` shows the old revision renumbered as the newest: a rollback does not "delete" history, it creates a new revision with the old version's content.
- `kubectl -n thu-nghiem get deployment web -o jsonpath='{.spec.template.spec.containers[0].image}'` prints the intended image.
- All Pods are `READY` and the application answers correctly.

## Common mistakes

- **Assuming undo restores everything:** only the Pod template is restored. If you changed `replicas` with `kubectl scale`, or edited a ConfigMap/Secret the Deployment references, those changes are not reverted automatically. For configuration, see [[ConfigMaps and Secrets: separating configuration from your application image on Kubernetes]].
- **Running undo while the Deployment is paused (`pause`):** run `rollout resume` first, otherwise the rollback will not proceed.
- **Empty or incomplete history:** caused by a too-low `revisionHistoryLimit` or old ReplicaSets that were cleaned up. For important releases, keep manifests in Git so you can redeploy that exact version.
- **Running the command on the wrong cluster or namespace:** check `kubectl config current-context` before rolling back in production.
- **Confusing `undo` with `restart`:** `rollout restart` only restarts Pods with the same configuration; it does not return to an older version.

## Summary

`kubectl rollout undo` is a quick lifeline, but it works well only when you notice early (thanks to `rollout status` and readiness probes), keep enough revisions, and understand the scope of what it restores. Treat it as a temporary measure to restore service; the root cause still has to be fixed in the code and manifests.

## References

- [Kubernetes: Deployments, section Rolling Back a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment)
- [kubectl rollout undo](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/)
- [kubectl rollout status](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_status/)
