---
title: Deployment và rolling update trong Kubernetes: cập nhật ứng dụng mà không gián đoạn
tags: kubernetes, deployment, rolling-update, kubectl, triển-khai
type: lab
---

> [!TLDR]
> - Deployment quản lý các Pod qua ReplicaSet; đổi phần `template` (ví dụ image) là Kubernetes tự khởi động một lượt cập nhật.
> - Chiến lược mặc định RollingUpdate thay Pod cũ bằng Pod mới từng đợt, nhờ `maxSurge` và `maxUnavailable` mà vẫn còn Pod phục vụ.
> - Theo dõi bằng `kubectl rollout status`; readiness probe quyết định khi nào một Pod mới được coi là sẵn sàng nhận lưu lượng.

## Mục tiêu

Sau bài này bạn tạo được một Deployment, đổi phiên bản image, quan sát Kubernetes thay Pod từng đợt và biết chỉnh tốc độ cập nhật. Bài dùng nginx làm ứng dụng mẫu cho dễ thử.

## Mở đầu: vì sao không tạo Pod trực tiếp

Một Pod đứng riêng không tự thay thế khi nút chạy nó hỏng, và cũng không biết "cập nhật" là gì. Deployment giải quyết cả hai: bạn khai báo trạng thái mong muốn ("chạy 3 bản sao của image này"), Deployment controller tạo một ReplicaSet giữ đúng số Pod đó và liên tục đối chiếu thực tế với khai báo.

Khi bạn đổi phiên bản, Deployment không sửa Pod đang chạy. Nó tạo một ReplicaSet mới cho phiên bản mới, tăng dần số Pod của ReplicaSet mới và giảm dần số Pod của ReplicaSet cũ. Cách làm này gọi là rolling update (cập nhật cuốn chiếu) và là chiến lược mặc định của Deployment.

## Chuẩn bị

- Một cụm Kubernetes để thử (minikube, kind hoặc cụm có sẵn) và `kubectl` kết nối được tới nó. Bài viết cho Kubernetes 1.30 trở lên; lệnh dưới đây không phụ thuộc phiên bản phụ cụ thể.
- Kiểm tra kết nối: `kubectl get nodes` phải liệt kê ít nhất một nút ở trạng thái `Ready`.
- Nên dùng một namespace riêng để dọn dẹp dễ: `kubectl create namespace thu-nghiem`.

## Các bước

### 1. Tạo Deployment

Lưu tệp `web.yaml`:

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

Áp dụng và chờ hoàn tất:

```bash
kubectl apply -f web.yaml
kubectl -n thu-nghiem rollout status deployment/web
kubectl -n thu-nghiem get pods -l app=web
```

Bạn sẽ thấy 3 Pod `Running` và `READY 1/1`.

### 2. Hiểu hai tham số tốc độ

- `maxSurge`: số Pod được phép vượt quá `replicas` trong lúc cập nhật. Có thể là số nguyên hoặc phần trăm.
- `maxUnavailable`: số Pod được phép không sẵn sàng trong lúc cập nhật.

Nếu bạn không khai báo, cả hai mặc định là 25%. Ở ví dụ trên, `maxSurge: 1` và `maxUnavailable: 0` nghĩa là: luôn đủ 3 Pod sẵn sàng, và mỗi lúc chỉ tạo thêm tối đa 1 Pod mới. Đây là lựa chọn thận trọng; đổi lại, cập nhật chậm hơn vì mỗi Pod mới phải qua readiness probe trước khi một Pod cũ bị gỡ.

### 3. Cập nhật phiên bản

Có hai cách. Cách khai báo: sửa `image: nginx:1.27` trong `web.yaml` rồi `kubectl apply -f web.yaml`. Cách nhanh bằng lệnh:

```bash
kubectl -n thu-nghiem set image deployment/web web=nginx:1.27
kubectl -n thu-nghiem rollout status deployment/web
```

Trong một terminal khác, chạy `kubectl -n thu-nghiem get pods -l app=web -w` để xem Pod mới xuất hiện và Pod cũ biến mất lần lượt. Lưu ý: chỉ thay đổi trong `.spec.template` (image, biến môi trường, nhãn của Pod...) mới kích hoạt lượt cập nhật. Đổi `replicas` thì chỉ co giãn, không tạo phiên bản mới.

### 4. Xem lịch sử và ghi chú lý do

```bash
kubectl -n thu-nghiem rollout history deployment/web
kubectl -n thu-nghiem annotate deployment/web \
  kubernetes.io/change-cause="nang nginx len 1.27" --overwrite
```

Mỗi lần template đổi tạo thêm một revision. Chú thích `kubernetes.io/change-cause` giúp cột lý do trong lịch sử có nghĩa. Mặc định Kubernetes giữ tối đa 10 revision (`revisionHistoryLimit`); các ReplicaSet cũ hơn bị dọn.

### 5. Tạm dừng và khởi động lại

```bash
kubectl -n thu-nghiem rollout pause deployment/web
# sửa nhiều thứ cùng lúc mà chưa kích hoạt lượt cập nhật
kubectl -n thu-nghiem rollout resume deployment/web
kubectl -n thu-nghiem rollout restart deployment/web
```

`pause` cho phép gom nhiều thay đổi thành một lượt cập nhật. `restart` thay toàn bộ Pod theo cùng cơ chế cuốn chiếu mà không đổi cấu hình, hữu ích khi ứng dụng cần đọc lại cấu hình.

## Kiểm tra

- `kubectl -n thu-nghiem get deployment web` cho `READY 3/3` và `UP-TO-DATE 3`.
- `kubectl -n thu-nghiem describe deployment web` hiển thị `NewReplicaSet` là bản mới, `OldReplicaSet` là `<none>` khi xong.
- Xác nhận image đang chạy: `kubectl -n thu-nghiem get pods -l app=web -o jsonpath='{.items[*].spec.containers[0].image}'`.

## Lỗi hay gặp

- **Cập nhật kẹt, Pod mới không `Ready`:** thường do image sai tên/tag (`ImagePullBackOff`) hoặc readiness probe không thành công. Dùng `kubectl describe pod` và `kubectl logs` để xem. Vì `maxUnavailable: 0`, Pod cũ vẫn phục vụ nên dịch vụ không sập. Sau thời hạn `progressDeadlineSeconds` (mặc định 600 giây), Deployment được đánh dấu không tiến triển, nhưng Kubernetes không tự quay lại bản cũ; việc đó bạn làm bằng tay, xem [[Quay lại phiên bản cũ trên Kubernetes bằng kubectl rollout undo]].
- **Không có readiness probe:** Pod được coi là sẵn sàng ngay khi container khởi động, nên Kubernetes có thể gỡ Pod cũ trước khi ứng dụng mới thật sự nhận được yêu cầu.
- **Dùng tag `latest`:** đổi nội dung image dưới cùng một tag sẽ không đổi template, nên không có lượt cập nhật nào. Hãy dùng tag cố định cho từng phiên bản.
- **Quên namespace:** lệnh không có `-n` sẽ nhắm namespace mặc định.

Muốn tạo image nhỏ gọn để triển khai, xem thêm [[Dockerfile nhiều tầng (multi-stage): build nặng, image chạy nhẹ]].

## Tóm lại

Deployment biến việc cập nhật thành thao tác khai báo: đổi template, Kubernetes lo phần thay Pod từng đợt. Chỉnh `maxSurge`, `maxUnavailable` và luôn có readiness probe để cân bằng tốc độ với độ an toàn. Dọn dẹp bài thử bằng `kubectl delete namespace thu-nghiem` (lệnh này xoá mọi thứ trong namespace đó, hãy chắc rằng bạn đang ở đúng cụm).

## Tham khảo

- [Kubernetes: Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes: Performing a rolling update](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/)
- [Kubernetes: Configure liveness, readiness and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
