---
title: PersistentVolumes, PersistentVolumeClaims and StorageClasses: keeping data in Kubernetes Pods
tags: kubernetes, persistentvolume, pvc, storageclass, storage
type: note
---

> [!TLDR]
> - Data inside a container is lost when the Pod is replaced; to keep it you need a persistent volume.
> - A PVC is the application's "request for capacity"; a PV is the actual storage; a StorageClass lets PVs be provisioned automatically.
> - The Delete reclaim policy removes the data when the PVC is deleted: check before deleting.

## Introduction

A container's filesystem is temporary: when a Pod is replaced (for example during the updates described in [[Kubernetes Deployments and rolling updates: updating your app without downtime]]), everything written inside the container disappears. Databases, uploaded files and user data need a place to live that exists independently of the Pod's lifecycle. Kubernetes uses three concepts that work together: PersistentVolume, PersistentVolumeClaim and StorageClass. This article explains each one and how they connect, once your application can be reached through [[Ingress and Gateway API on Kubernetes: exposing your app over HTTPS]].

## The three concepts

- **PersistentVolume (PV):** a piece of real storage in the cluster (a disk, a network drive, and so on). It is a cluster-wide resource and belongs to no namespace.
- **PersistentVolumeClaim (PVC):** the application's storage request: how much capacity and which access mode. A PVC belongs to a namespace.
- **StorageClass:** describes a "kind" of storage (fast, slow, from a given provider) and lets the cluster **create a PV automatically** when a new PVC appears.

A simple picture: the PV is a room, the PVC is an application to rent a room, and the StorageClass is the price list of room types plus the procedure for building a room when an application arrives.

## Automatic provisioning through a StorageClass

The most common approach today is **dynamic provisioning**: you only create a PVC, and the cluster creates a suitable PV through a StorageClass. See which classes exist:

```bash
kubectl get storageclass
```

The class marked `(default)` is used when a PVC does not specify `storageClassName`. If a cluster has no default StorageClass and no pre-created PV, the PVC waits forever.

Create a PVC:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
  namespace: demo
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

```bash
kubectl apply -f pvc.yaml
kubectl -n demo get pvc data
```

The status `Bound` means the PVC is attached to a PV. For `Pending`, look at `kubectl -n demo describe pvc data`.

### Binding mode (volumeBindingMode)

A StorageClass has a `volumeBindingMode` field:

- `Immediate`: the PV is created as soon as the PVC exists.
- `WaitForFirstConsumer`: waits until a Pod uses the PVC before creating it, so that it can pick the right location (for example the same zone as the node running the Pod). So a PVC can stay `Pending` until a Pod is created, and that is normal behavior.

## Using a PVC in a Pod

A Pod references the PVC through `volumes`, then mounts it at a path inside the container:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: writer
  namespace: demo
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "date >> /data/log.txt; sleep 3600"]
      volumeMounts:
        - name: storage
          mountPath: /data
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: data
```

To verify that the data survives after the Pod is deleted:

```bash
kubectl -n demo delete pod writer
kubectl apply -f writer.yaml
kubectl -n demo exec writer -- cat /data/log.txt
```

If everything is right, the file still contains the line written by the previous run. For stateful applications running several replicas, a StatefulSet with `volumeClaimTemplates` is commonly used so that each Pod gets its own PVC.

## Access modes

`accessModes` describes how the volume can be mounted:

- `ReadWriteOnce`: read-write by a single node at a time.
- `ReadOnlyMany`: read-only by many nodes.
- `ReadWriteMany`: read-write by many nodes.
- `ReadWriteOncePod`: read-write by exactly one Pod.

Whether a storage type supports a given mode depends on the storage driver behind it; not every type supports `ReadWriteMany`.

## Reclaim policy: when a PVC is deleted

A PV has a `persistentVolumeReclaimPolicy` that decides what happens to the data when its PVC is deleted:

- **Retain:** the PV remains, the data is kept, and an administrator handles it manually.
- **Delete:** the PV and the underlying storage are deleted along with the PVC.

> **Warning:** with `Delete`, the command `kubectl delete pvc data` also deletes the data, and this cannot be undone. Before deleting the PVC of important data, make a backup and check the policy with `kubectl get pv`. A PV's policy can be changed to `Retain` (see "Change the Reclaim Policy of a PersistentVolume" in the references).

A PVC that is in use by a Pod is protected by Kubernetes: when you delete it, it is only actually removed once no Pod uses it any more.

## Expanding capacity

If the StorageClass sets `allowVolumeExpansion: true`, you can raise `spec.resources.requests.storage` on the PVC and apply it again. You can only increase it, never decrease it.

## Checking

1. `kubectl get storageclass` shows a default class.
2. `kubectl -n demo get pvc` is `Bound` (or a reasonable `Pending` with `WaitForFirstConsumer`).
3. Delete the Pod and recreate it; the data is still there.
4. `kubectl get pv` shows the matching PV and its reclaim policy.

## Common mistakes

- **No default StorageClass:** the PVC is stuck at `Pending`.
- **Confusing `ReadWriteOnce` with several Pods on several nodes:** the second Pod cannot mount the volume.
- **Deleting a PVC when the reclaim policy is `Delete`:** data is lost.
- **Putting the PVC in a different namespace from the Pod:** the Pod cannot find the claim.
- **Treating a volume as a backup:** a PV is not a substitute for backups; back up separately.

## Summary

The PVC is the request, the PV is the storage, and the StorageClass automates provisioning. A Pod only has to reference the PVC, and the data lives apart from the Pod's lifecycle. Always check the reclaim policy and have a backup before deleting.

## References

- [Persistent Volumes (Kubernetes documentation)](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Change the Reclaim Policy of a PersistentVolume](https://kubernetes.io/docs/tasks/administer-cluster/change-pv-reclaim-policy/)
