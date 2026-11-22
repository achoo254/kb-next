---
title: ConfigMaps and Secrets: separating configuration from your application image on Kubernetes
tags: kubernetes, configmap, secret, configuration, security
type: note
---

> [!TLDR]
> - A ConfigMap holds ordinary configuration and a Secret holds sensitive data; both separate configuration from the image so one image can run in many environments.
> - They can reach a Pod as environment variables or as mounted files; environment variables are read only when the Pod starts.
> - A Secret is only base64-encoded, not securely encrypted: use strict RBAC and consider enabling encryption at rest.

## Introduction

A familiar principle when packaging applications: the same image must run in both test and production, and only the configuration differs. If you bake a database address or a password into the image, you must rebuild per environment and accidentally spread secrets everywhere the image is copied. Kubernetes offers two objects to separate this: ConfigMap and Secret. This article follows on from updating and rolling back applications, because a configuration change is also a kind of change that needs careful management.

## ConfigMap: non-sensitive configuration

A ConfigMap is a set of key-value pairs (or the contents of whole files). The maximum size of one ConfigMap is 1 MiB. Create one with a command:

```bash
kubectl -n thu-nghiem create configmap app-config \
  --from-literal=LOG_LEVEL=info \
  --from-literal=APP_MODE=production
kubectl -n thu-nghiem get configmap app-config -o yaml
```

Or declare it in YAML:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: thu-nghiem
data:
  LOG_LEVEL: "info"
  APP_MODE: "production"
  app.properties: |
    cache.ttl=60
    feature.new-ui=false
```

## Secret: sensitive data

A Secret is for passwords, tokens, TLS keys and so on. The syntax is similar to a ConfigMap:

```bash
kubectl -n thu-nghiem create secret generic db-secret \
  --from-literal=DB_PASSWORD='change-this-password'
```

The sample value above is only an illustration; never put a real password in a file in Git or in a shared command history. In the Secret's `data` field, values are stored as base64:

```bash
kubectl -n thu-nghiem get secret db-secret -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
```

This shows a point to remember: **base64 is only a representation, not encryption**. Anyone who can read the Secret can decode it immediately. Therefore:

- Restrict read access to Secrets with RBAC, following least privilege.
- Enable encryption of data at rest in etcd if you manage the cluster yourself; managed Kubernetes services usually offer a similar option.
- Consider an external secret store for serious environments.
- Secrets have dedicated types for common cases, such as `kubernetes.io/tls` for certificates and `kubernetes.io/dockerconfigjson` for image registry credentials.

## Getting configuration into a Pod

There are two main ways, and you can use both in one Deployment:

```yaml
spec:
  containers:
    - name: web
      image: nginx:1.27
      envFrom:
        - configMapRef:
            name: app-config
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: DB_PASSWORD
      volumeMounts:
        - name: cau-hinh
          mountPath: /etc/app
          readOnly: true
  volumes:
    - name: cau-hinh
      configMap:
        name: app-config
        items:
          - key: app.properties
            path: app.properties
```

- **Environment variables:** simple, but values are read only when the container starts. Editing the ConfigMap/Secret does not make running Pods see the new value.
- **Mounted files (volumes):** the kubelet updates the file contents after the ConfigMap/Secret changes, with a delay of tens of seconds; the application must know how to re-read the file. A mount using `subPath` is not updated automatically.

## How to apply new configuration

Because Pods do not restart on their own when a ConfigMap changes, the common approach is:

```bash
kubectl -n thu-nghiem apply -f app-config.yaml
kubectl -n thu-nghiem rollout restart deployment/web
kubectl -n thu-nghiem rollout status deployment/web
```

This way the new configuration goes through the same rolling mechanism and can be rolled back like a normal update. Another approach is to put a version or hash in the ConfigMap name and edit the Deployment to point to the new name; then every configuration change leaves a revision in the history. For configuration that never changes, set `immutable: true` on the ConfigMap or Secret to prevent accidental edits and reduce load on the API server; to change it, you must create a new object.

## Common mistakes

- **A Pod in `CreateContainerConfigError`:** the ConfigMap/Secret name or key is wrong, or the object does not exist in the same namespace (ConfigMaps and Secrets can only be used within the Pod's namespace).
- **Editing a ConfigMap and the application does not change:** caused by environment variables or `subPath`; run `rollout restart`.
- **Putting a Secret in Git as plain YAML:** anyone who can view the repository can decode the base64. Use a secret-encryption tool or an external secret store.
- **Printing Secrets to logs:** avoid `env` or dumping the entire configuration in the application.

## Summary

ConfigMaps handle ordinary configuration, Secrets handle sensitive data, and both let one image travel across environments. Remember that a Secret is not secure by itself: it needs access control, encryption at rest and a management process. When configuration changes, use `rollout restart` so Pods pick up the new values in a controlled way.

## References

- [Kubernetes: ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Kubernetes: Good practices for Kubernetes Secrets](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)
- [Kubernetes: Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)
