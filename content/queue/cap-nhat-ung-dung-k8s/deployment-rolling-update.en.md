---
title: Kubernetes Deployments and rolling updates: updating your app without downtime
tags: kubernetes, deployment, rolling-update, kubectl, rollout
type: lab
---

> [!TLDR]
> - A Deployment manages Pods through ReplicaSets; changing the `template` section (for example the image) makes Kubernetes start a rollout automatically.
> - The default RollingUpdate strategy replaces old Pods with new ones in batches; `maxSurge` and `maxUnavailable` keep Pods serving traffic throughout.
> - Follow progress with `kubectl rollout status`; the readiness probe decides when a new Pod counts as ready to receive traffic.

## Goal

After this article you can create a Deployment, change the image version, watch Kubernetes replace Pods in batches, and tune the pace of the update. The article uses nginx as a sample app because it is easy to try.

## Introduction: why not create Pods directly

A standalone Pod does not replace itself if its node fails, and it has no notion of an "update". A Deployment solves both: you declare the desired state ("run 3 replicas of this image"), the Deployment controller creates a ReplicaSet that keeps exactly that many Pods, and it keeps comparing reality with your declaration.

When you change the version, the Deployment does not edit running Pods. It creates a new ReplicaSet for the new version, gradually increases the new ReplicaSet's Pod count and decreases the old one's. This is called a rolling update, and it is the default strategy of a Deployment.

## Preparation

- A Kubernetes cluster to experiment with (minikube, kind or an existing cluster) and `kubectl` connected to it. This article targets Kubernetes 1.30 or later; the commands below do not depend on a specific minor version.
- Check the connection: `kubectl get nodes` must list at least one node in the `Ready` state.
- Use a dedicated namespace so cleanup is easy: `kubectl create namespace thu-nghiem`.

## Steps

### 1. Create the Deployment

Save a file named `web.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: thu-nghiem
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.26
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
```

Apply it and wait for completion:

```bash
kubectl apply -f web.yaml
kubectl -n thu-nghiem rollout status deployment/web
kubectl -n thu-nghiem get pods -l app=web
```

You should see 3 Pods that are `Running` and `READY 1/1`.

### 2. Understand the two pace parameters

- `maxSurge`: how many Pods may exist above `replicas` during the update. It can be an integer or a percentage.
- `maxUnavailable`: how many Pods may be unavailable during the update.

If you do not set them, both default to 25%. In the example above, `maxSurge: 1` and `maxUnavailable: 0` mean: there are always 3 ready Pods, and at most 1 extra new Pod is created at any moment. This is the cautious choice; the price is a slower update, because each new Pod must pass its readiness probe before an old Pod is removed.

### 3. Update the version

There are two ways. The declarative way: edit `image: nginx:1.27` in `web.yaml` and run `kubectl apply -f web.yaml`. The quick way with a command:

```bash
kubectl -n thu-nghiem set image deployment/web web=nginx:1.27
kubectl -n thu-nghiem rollout status deployment/web
```

In another terminal, run `kubectl -n thu-nghiem get pods -l app=web -w` to watch new Pods appear and old Pods disappear one after another. Note: only changes in `.spec.template` (image, environment variables, Pod labels...) trigger a rollout. Changing `replicas` only scales; it does not create a new version.

### 4. View history and record the reason

```bash
kubectl -n thu-nghiem rollout history deployment/web
kubectl -n thu-nghiem annotate deployment/web \
  kubernetes.io/change-cause="upgrade nginx to 1.27" --overwrite
```

Every template change creates one more revision. The `kubernetes.io/change-cause` annotation makes the reason column in the history meaningful. By default Kubernetes keeps at most 10 revisions (`revisionHistoryLimit`); older ReplicaSets are cleaned up.

### 5. Pause and restart

```bash
kubectl -n thu-nghiem rollout pause deployment/web
# change several things at once without triggering a rollout
kubectl -n thu-nghiem rollout resume deployment/web
kubectl -n thu-nghiem rollout restart deployment/web
```

`pause` lets you batch several changes into a single rollout. `restart` replaces all Pods using the same rolling mechanism without changing the configuration, which is useful when the application needs to re-read its configuration.

## Verification

- `kubectl -n thu-nghiem get deployment web` shows `READY 3/3` and `UP-TO-DATE 3`.
- `kubectl -n thu-nghiem describe deployment web` shows `NewReplicaSet` as the new one and `OldReplicaSet` as `<none>` when finished.
- Confirm the running image: `kubectl -n thu-nghiem get pods -l app=web -o jsonpath='{.items[*].spec.containers[0].image}'`.

## Common mistakes

- **The rollout is stuck and new Pods never become `Ready`:** usually a wrong image name/tag (`ImagePullBackOff`) or a failing readiness probe. Use `kubectl describe pod` and `kubectl logs` to investigate. Because `maxUnavailable: 0`, old Pods keep serving, so the service does not go down. After `progressDeadlineSeconds` (default 600 seconds) the Deployment is marked as not progressing, but Kubernetes does not roll back by itself; you do that manually, see [[Rolling back on Kubernetes with kubectl rollout undo]].
- **No readiness probe:** a Pod counts as ready as soon as its container starts, so Kubernetes may remove an old Pod before the new application can actually accept requests.
- **Using the `latest` tag:** changing the image content under the same tag does not change the template, so no rollout happens. Use a fixed tag for each version.
- **Forgetting the namespace:** a command without `-n` targets the default namespace.

To build small images for deployment, see also [[Multi-stage Dockerfiles: heavy builds, light runtime images]].

## Summary

A Deployment turns updating into a declarative action: change the template and Kubernetes replaces Pods in batches. Tune `maxSurge` and `maxUnavailable`, and always add a readiness probe to balance speed with safety. Clean up the experiment with `kubectl delete namespace thu-nghiem` (this deletes everything in that namespace, so make sure you are on the right cluster).

## References

- [Kubernetes: Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes: Performing a rolling update](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/)
- [Kubernetes: Configure liveness, readiness and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
