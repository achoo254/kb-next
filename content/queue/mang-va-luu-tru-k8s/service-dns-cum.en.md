---
title: Kubernetes Services: ClusterIP, NodePort, LoadBalancer and cluster DNS
tags: kubernetes, service, clusterip, nodeport, dns
type: note
---

> [!TLDR]
> - A Pod's IP address keeps changing; a Service gives a group of Pods one stable address and name.
> - ClusterIP is for in-cluster use only, NodePort opens a port on every node, and LoadBalancer asks the infrastructure for a public address.
> - Cluster DNS lets Pods call each other by name, such as `web.demo.svc.cluster.local`.

## Introduction

When you run applications on Kubernetes, you soon run into a problem: Pods come and go constantly. Every time a Deployment updates or a node has trouble, new Pods are created with new IP addresses. If another application hard-codes a Pod's IP, it breaks the first time that Pod is replaced. Kubernetes solves this with an object called a **Service**: it sits in front of a group of Pods and gives that group a virtual address and a DNS name that do not change.

This article explains how a Service works, the three common kinds (ClusterIP, NodePort, LoadBalancer) and how Pods find each other through cluster DNS. If you do not yet know how Pods are created by a Deployment, read [[Kubernetes Deployments and rolling updates: updating your app without downtime]] first; it explains why Pods get replaced during updates, which is exactly why Services exist.

## A Service selects Pods by label

A Service knows nothing about Pods except their labels. You declare a `selector`, and Kubernetes keeps track of the Pods whose labels match and that are ready, then sends traffic to them (that list of addresses is stored in EndpointSlice objects). When Pods are added or lost, the list updates itself.

Here is a Deployment named `web` with the label `app: web`, and a Service for it:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: demo
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
```

Two numbers need to be told apart: `port` is the Service's port (where clients connect), while `targetPort` is the port the container actually listens on. They can differ, and that is a common source of confusion.

Apply it and check:

```bash
kubectl create namespace demo
kubectl apply -f service-web.yaml
kubectl -n demo get service web
kubectl -n demo get endpointslices
```

If the address column in the EndpointSlice is empty, the selector matches no Pod's labels, or the Pods are not ready.

## The three common Service types

### ClusterIP: the default, inside the cluster only

If you do not write a `type`, the Service is **ClusterIP**. It receives an internal virtual address and can only be reached from inside the cluster. This is the right choice for most internal components such as databases, queues or helper APIs, because they should not be exposed to the outside.

### NodePort: open a port on every node

With `type: NodePort`, Kubernetes creates a ClusterIP and also opens a port on **every node** in the cluster, by default in the range 30000–32767. Connecting to `node-address:port` forwards to the Service. This is handy for testing or as a base for a load balancer you build yourself, but it is rarely how you expose an application to end users, because of the unusual port numbers and because you have to manage node choice yourself.

```yaml
spec:
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080
```

You can omit `nodePort` and let Kubernetes pick a free port.

### LoadBalancer: ask the infrastructure for a public address

With `type: LoadBalancer`, Kubernetes asks the underlying infrastructure to create an external load balancer and attaches its address to the Service. This only works when the cluster has a component that does that: usually a managed cloud service, or an add-on you install on a self-built cluster. Without one, the `EXTERNAL-IP` column stays at `<pending>` forever.

```bash
kubectl -n demo get service web
```

Each `LoadBalancer` Service usually costs a separate load balancer. When you have many web applications, people typically put them behind one shared Ingress or Gateway; that topic is the subject of the next article in this planet.

## Cluster DNS: calling each other by name

A Kubernetes cluster runs a DNS service. Every Service gets a name record following this pattern:

```text
<service-name>.<namespace>.svc.cluster.local
```

For the example above, the full name is `web.demo.svc.cluster.local`. Each Pod has its `/etc/resolv.conf` preconfigured by the kubelet with a search list that includes the Pod's own namespace, so:

- Inside the same namespace `demo`, you can simply call `web`.
- From another namespace, use `web.demo` or the full name.

To try it, run a temporary Pod and look up the name:

```bash
kubectl -n demo run dnstest --rm -it --image=busybox:1.36 --restart=Never -- nslookup web
```

The output shows the Service's ClusterIP. If you are used to Docker, the idea resembles [[User-defined bridge networks in Docker: containers calling each other by name through built-in DNS]]: names replace IPs. The difference is that in Kubernetes the name points to a Service (a stable address that balances load across several Pods), not directly to one container.

### Headless Services

If you set `clusterIP: None`, the Service becomes **headless**: it has no virtual address, and DNS returns the addresses of the individual Pods directly. Use this when clients need to know each Pod, for example stateful applications run by a StatefulSet.

## Checking

1. `kubectl -n demo get service web` shows the Service with a `CLUSTER-IP`.
2. `kubectl -n demo get endpointslices` shows the Pod addresses.
3. Run a temporary Pod and `nslookup web` returns an address.
4. For NodePort, call `curl http://192.0.2.10:30080` (replace with your node's address).

## Common mistakes

- **Selector does not match labels:** the Service exists but has no endpoints. Compare with `kubectl get pods --show-labels`.
- **Mixing up `port` and `targetPort`:** connections are refused even though the Pod runs fine.
- **Pod not Ready:** a Service only sends traffic to ready Pods; check the readiness probe.
- **LoadBalancer stuck at `<pending>`:** the cluster has no component that provides load balancers.
- **Calling a Service from another namespace without the namespace part.**

## Summary

A Service turns an ever-changing group of Pods into one stable target: ClusterIP for inside the cluster, NodePort to open a port on the nodes, LoadBalancer to ask the infrastructure for a public address. Cluster DNS lets you call by name instead of IP. The next article in this planet covers exposing many applications more tidily.

## References

- [Service (Kubernetes documentation)](https://kubernetes.io/docs/concepts/services-networking/service/)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
