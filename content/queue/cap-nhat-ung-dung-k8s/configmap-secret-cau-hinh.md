---
title: ConfigMap và Secret: tách cấu hình khỏi image ứng dụng trên Kubernetes
tags: kubernetes, configmap, secret, cấu-hình, bảo-mật
type: note
---

> [!TLDR]
> - ConfigMap chứa cấu hình thường, Secret chứa dữ liệu nhạy cảm; cả hai tách cấu hình khỏi image để một image chạy được ở nhiều môi trường.
> - Có thể đưa vào Pod dưới dạng biến môi trường hoặc tệp được gắn (mount); biến môi trường chỉ đọc lúc Pod khởi động.
> - Secret chỉ mã hoá base64, không phải mã hoá bảo mật: cần RBAC chặt và nên bật mã hoá khi lưu (encryption at rest).

## Mở đầu

Một nguyên tắc quen thuộc khi đóng gói ứng dụng: cùng một image phải chạy được ở môi trường thử và môi trường thật, phần khác nhau là cấu hình. Nếu nhúng địa chỉ cơ sở dữ liệu hay mật khẩu vào image, bạn phải build lại cho mỗi môi trường và vô tình đưa bí mật vào mọi nơi image được sao chép. Kubernetes cung cấp hai đối tượng để tách việc này: ConfigMap và Secret. Bài này nối tiếp phần cập nhật và hoàn tác ứng dụng, vì cấu hình đổi cũng là một kiểu thay đổi cần quản lý cẩn thận.

## ConfigMap: cấu hình không nhạy cảm

ConfigMap là tập cặp khoá-giá trị (hoặc nội dung cả tệp). Dung lượng tối đa của một ConfigMap là 1 MiB. Tạo bằng lệnh:

```bash
kubectl -n thu-nghiem create configmap app-config \
  --from-literal=LOG_LEVEL=info \
  --from-literal=APP_MODE=production
kubectl -n thu-nghiem get configmap app-config -o yaml
```

Hoặc khai báo bằng YAML:

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

## Secret: dữ liệu nhạy cảm

Secret dùng cho mật khẩu, token, khoá TLS... Cú pháp tương tự ConfigMap:

```bash
kubectl -n thu-nghiem create secret generic db-secret \
  --from-literal=DB_PASSWORD='doi-mat-khau-nay'
```

Giá trị mẫu ở trên chỉ để minh hoạ; không bao giờ đưa mật khẩu thật vào tệp trong Git hay lịch sử lệnh dùng chung. Trong trường `data` của Secret, giá trị được lưu dưới dạng base64:

```bash
kubectl -n thu-nghiem get secret db-secret -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
```

Điều này cho thấy một điểm cần nhớ: **base64 chỉ là cách biểu diễn, không phải mã hoá**. Ai đọc được Secret thì giải mã được ngay. Vì vậy:

- Giới hạn quyền đọc Secret bằng RBAC theo nguyên tắc tối thiểu.
- Bật mã hoá dữ liệu khi lưu trong etcd (encryption at rest) nếu cụm do bạn quản lý; các dịch vụ Kubernetes do nhà cung cấp quản lý thường có tuỳ chọn tương tự.
- Cân nhắc kho bí mật bên ngoài (external secrets) cho môi trường nghiêm túc.
- Secret có loại riêng cho trường hợp thường gặp, như `kubernetes.io/tls` cho chứng chỉ và `kubernetes.io/dockerconfigjson` cho thông tin đăng nhập kho image.

## Đưa cấu hình vào Pod

Có hai cách chính, có thể dùng chung trong một Deployment:

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

- **Biến môi trường:** đơn giản, nhưng giá trị chỉ được đọc khi container khởi động. Sửa ConfigMap/Secret không làm Pod đang chạy thấy giá trị mới.
- **Tệp được gắn (volume):** nội dung tệp được kubelet cập nhật sau khi ConfigMap/Secret đổi, có độ trễ vài chục giây; ứng dụng phải biết đọc lại tệp. Gắn bằng `subPath` thì không được cập nhật tự động.

## Làm sao áp dụng cấu hình mới

Vì Pod không tự khởi động lại khi ConfigMap đổi, cách làm phổ biến là:

```bash
kubectl -n thu-nghiem apply -f app-config.yaml
kubectl -n thu-nghiem rollout restart deployment/web
kubectl -n thu-nghiem rollout status deployment/web
```

Nhờ đó cấu hình mới đi qua đúng cơ chế cuốn chiếu và có thể hoàn tác như một lần cập nhật bình thường. Một cách khác là đặt tên ConfigMap kèm phiên bản hoặc mã băm, rồi sửa Deployment trỏ tới tên mới; khi ấy mọi thay đổi cấu hình đều để lại revision trong lịch sử. Với cấu hình không bao giờ đổi, đặt `immutable: true` trong ConfigMap hoặc Secret để tránh sửa nhầm và giảm tải cho máy chủ API; muốn đổi thì phải tạo đối tượng mới.

## Lỗi hay gặp

- **Pod ở trạng thái `CreateContainerConfigError`:** tên ConfigMap/Secret hoặc khoá sai, hoặc đối tượng chưa tồn tại trong cùng namespace (ConfigMap và Secret chỉ dùng được trong namespace của Pod).
- **Sửa ConfigMap mà ứng dụng không đổi:** do dùng biến môi trường hoặc `subPath`; hãy `rollout restart`.
- **Đưa Secret vào Git dưới dạng YAML rõ:** ai xem kho mã cũng giải mã được base64. Dùng công cụ mã hoá bí mật hoặc kho bí mật bên ngoài.
- **In Secret ra log:** tránh `env` hay in toàn bộ cấu hình trong ứng dụng.

## Tóm lại

ConfigMap lo cấu hình thường, Secret lo dữ liệu nhạy cảm, và cả hai giúp một image đi qua nhiều môi trường. Hãy nhớ Secret chưa an toàn tự thân: cần phân quyền, mã hoá khi lưu và quy trình quản lý. Khi cấu hình đổi, dùng `rollout restart` để Pod nhận giá trị mới một cách có kiểm soát.

## Tham khảo

- [Kubernetes: ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Kubernetes: Good practices for Kubernetes Secrets](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)
- [Kubernetes: Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)
