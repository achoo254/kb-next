---
title: Ingress and Gateway API on Kubernetes: exposing your app over HTTPS
tags: kubernetes, ingress, gateway-api, https, tls
type: note
---

> [!TLDR]
> - Ingress declares HTTP/HTTPS routing rules by hostname and path; an Ingress controller must be installed for the rules to take effect.
> - IngressClass says which controller handles which Ingress; the TLS certificate lives in a Secret.
> - The Kubernetes project recommends Gateway API for new needs; Ingress remains usable and is not being removed.

## Introduction

In [[Kubernetes Services: ClusterIP, NodePort, LoadBalancer and cluster DNS]] we saw how Services help Pods find each other. To let outside users reach a web application, you could use a LoadBalancer Service, but one load balancer per application quickly becomes expensive and hard to manage. Kubernetes has two ways to consolidate: **Ingress** (the long-standing way) and **Gateway API** (the newer way). This article explains both and how to turn on HTTPS.

## What Ingress is

Ingress is an object that declares HTTP and HTTPS routing rules: which hostname and path a request is sent to, and which Service receives it. One point many people miss: **Ingress itself does nothing**. It is only a declaration. You must install an **Ingress controller** (a program running in the cluster that reads Ingresses and configures a matching proxy). Kubernetes ships with no controller; there are many choices from the community and from cloud providers.

### IngressClass

A cluster can run several controllers. `IngressClass` is an object that names each controller, and an Ingress picks its controller with the `ingressClassName` field. List the classes available:

```bash
kubectl get ingressclass
```

If the list is empty, the cluster has no controller and the Ingress you create will be handled by nobody.

### Example: routing by hostname and path

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: demo
spec:
  ingressClassName: example-class
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

A quick explanation:

- `host` is the hostname; if left empty, the rule applies to all hostnames.
- `pathType: Prefix` matches by path prefix; `Exact` requires an exact match; `ImplementationSpecific` leaves the decision to the controller.
- `backend.service` points to a Service in the **same namespace** as the Ingress.

The class name `example-class` above is only an example; replace it with a name from `kubectl get ingressclass`.

## Turning on HTTPS with TLS

For an Ingress to serve HTTPS, you need a certificate and private key stored in a Secret of type `kubernetes.io/tls` in the same namespace. Create it with:

```bash
kubectl -n demo create secret tls web-tls --cert=fullchain.pem --key=privkey.pem
```

Then reference it in the Ingress:

```yaml
spec:
  ingressClassName: example-class
  tls:
    - hosts:
        - app.example.com
      secretName: web-tls
  rules:
    - host: app.example.com
      # ... as above
```

Note: the private key is a secret. Do not put key files into a source repository; handling Secrets is discussed further in [[ConfigMaps and Secrets: separating configuration from your application image on Kubernetes]]. Many teams also use a component that requests and renews certificates automatically instead of creating them by hand, but the mechanism underneath is still a TLS-type Secret as above.

When you choose a controller, read its own documentation, because many advanced features (path rewriting, rate limiting, redirects) are configured through annotations specific to each controller and are not part of the common Ingress specification.

## Gateway API: the newer way

The Kubernetes documentation states plainly that the project recommends using **Gateway** instead of Ingress; the Ingress API has been "frozen" (no further development), but it is still GA and there are **no plans to remove it**. So you need not rush to drop an Ingress that works well, but for new systems consider Gateway API.

Gateway API separates roles more clearly with three main kinds of objects:

- **GatewayClass:** the type of infrastructure, defined by a provider or the platform team.
- **Gateway:** a specific entry point, declaring the ports and protocols to listen on (including TLS).
- **HTTPRoute:** an application's HTTP routing rules, attached to a Gateway.

This split lets operations teams manage the Gateway while application teams write only their own HTTPRoute. Gateway API is a set of CRDs you install into the cluster and it needs an implementation that supports it; it is not available by default. A minimal HTTPRoute example:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
  namespace: demo
spec:
  parentRefs:
    - name: shared-gateway
  hostnames:
    - app.example.com
  rules:
    - backendRefs:
        - name: web
          port: 80
```

## Quick comparison

| | Ingress | Gateway API |
|---|---|---|
| Status | GA, frozen | Recommended for new needs |
| Roles | One object for everything | Separate Class, Gateway, Route |
| Advanced features | Often via controller-specific annotations | Many are part of the specification |
| Extra installation | Ingress controller | Gateway API CRDs and an implementation |

## Checking

1. `kubectl get ingressclass` shows at least one class.
2. `kubectl -n demo get ingress web` shows an address in the `ADDRESS` column (it may take a while).
3. Point the hostname's DNS to that address, then run `curl -I https://app.example.com`.
4. Use `kubectl -n demo describe ingress web` to read the events if it is not working.

## Common mistakes

- **Forgetting to install a controller:** the Ingress exists but gets no address.
- **Wrong `ingressClassName`:** no controller picks it up.
- **TLS Secret in another namespace:** it must be in the same namespace as the Ingress.
- **Wrong backend Service name or port:** you get 503 or 404 errors from the proxy.
- **DNS not yet pointed**, or a certificate that does not match the hostname.

## Summary

Ingress gathers HTTP/HTTPS routing into one entry point, but it needs a controller and the right `ingressClassName`. HTTPS uses a TLS-type Secret. Ingress is still supported; for new systems, Gateway API is the recommended direction, with clearer role separation.

## References

- [Ingress (Kubernetes documentation)](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Gateway API (Kubernetes documentation)](https://kubernetes.io/docs/concepts/services-networking/gateway/)
- [TLS Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets)
