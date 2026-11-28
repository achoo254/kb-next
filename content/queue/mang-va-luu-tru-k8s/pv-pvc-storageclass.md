---
title: PersistentVolume, PersistentVolumeClaim và StorageClass: cho Pod giữ dữ liệu trên Kubernetes
tags: kubernetes, persistentvolume, pvc, storageclass, lưu trữ
type: note
---

> [!TLDR]
> - Dữ liệu trong container mất khi Pod bị thay thế; muốn giữ lại phải dùng volume bền vững.
> - PVC là "đơn xin dung lượng" của ứng dụng; PV là phần lưu trữ thực; StorageClass cho phép cấp PV tự động.
> - Chính sách reclaim Delete sẽ xoá dữ liệu khi xoá PVC: hãy kiểm tra trước khi xoá.

## Mở đầu

Hệ tệp bên trong container là tạm thời: khi Pod bị thay thế (ví dụ trong quá trình cập nhật được mô tả ở [[Deployment và rolling update trong Kubernetes: cập nhật ứng dụng mà không gián đoạn]]), mọi thứ ghi trong container biến mất. Cơ sở dữ liệu, tệp tải lên hay dữ liệu của người dùng cần một chỗ lưu tồn tại độc lập với vòng đời Pod. Kubernetes dùng ba khái niệm phối hợp với nhau: PersistentVolume, PersistentVolumeClaim và StorageClass. Bài này giải thích từng cái và cách chúng kết nối, sau khi ứng dụng đã có thể được truy cập qua [[Ingress và Gateway API trên Kubernetes: đưa ứng dụng ra ngoài qua HTTPS]].

## Ba khái niệm

- **PersistentVolume (PV):** một phần lưu trữ thực trong cụm (đĩa, ổ mạng, v.v.). Nó là tài nguyên của cả cụm, không thuộc namespace nào.
- **PersistentVolumeClaim (PVC):** yêu cầu lưu trữ của ứng dụng: cần bao nhiêu dung lượng, kiểu truy cập nào. PVC thuộc một namespace.
- **StorageClass:** mô tả một "loại" lưu trữ (nhanh, chậm, của nhà cung cấp nào) và cho phép cụm **tự tạo PV** khi có PVC mới.

Hình dung đơn giản: PV là căn phòng, PVC là đơn xin thuê phòng, StorageClass là bảng giá các loại phòng kèm quy trình tự xây phòng khi có đơn.

## Cấp phát tự động qua StorageClass

Cách phổ biến nhất ngày nay là **dynamic provisioning**: bạn chỉ tạo PVC, cụm tự tạo PV phù hợp thông qua StorageClass. Xem các lớp hiện có:

```bash
kubectl get storageclass
```

Lớp được đánh dấu `(default)` sẽ được dùng khi PVC không ghi `storageClassName`. Một cụm không có StorageClass mặc định và không có PV tạo sẵn thì PVC sẽ chờ mãi.

Tạo một PVC:

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

Trạng thái `Bound` nghĩa là PVC đã gắn với một PV. Trạng thái `Pending` cần xem `kubectl -n demo describe pvc data`.

### Chế độ gắn kết (volumeBindingMode)

StorageClass có trường `volumeBindingMode`:

- `Immediate`: PV được tạo ngay khi có PVC.
- `WaitForFirstConsumer`: đợi tới khi có Pod dùng PVC mới tạo, để chọn đúng vị trí (ví dụ cùng vùng với node chạy Pod). Vì thế PVC có thể ở `Pending` cho tới khi Pod được tạo, và đó là hành vi bình thường.

## Dùng PVC trong Pod

Pod tham chiếu PVC qua `volumes`, rồi gắn vào đường dẫn trong container:

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

Để kiểm chứng dữ liệu còn lại sau khi Pod bị xoá:

```bash
kubectl -n demo delete pod writer
kubectl apply -f writer.yaml
kubectl -n demo exec writer -- cat /data/log.txt
```

Nếu mọi thứ đúng, tệp vẫn có dòng ghi từ lần chạy trước. Với ứng dụng có trạng thái chạy nhiều bản, thường dùng StatefulSet với `volumeClaimTemplates` để mỗi Pod có PVC riêng.

## Chế độ truy cập

`accessModes` mô tả cách volume được gắn:

- `ReadWriteOnce`: đọc ghi bởi một node tại một thời điểm.
- `ReadOnlyMany`: nhiều node chỉ đọc.
- `ReadWriteMany`: nhiều node đọc ghi.
- `ReadWriteOncePod`: đọc ghi bởi đúng một Pod.

Loại lưu trữ có hỗ trợ chế độ nào hay không phụ thuộc vào trình điều khiển (driver) lưu trữ phía sau; không phải loại nào cũng hỗ trợ `ReadWriteMany`.

## Chính sách reclaim: khi PVC bị xoá

PV có `persistentVolumeReclaimPolicy` quyết định số phận dữ liệu khi PVC bị xoá:

- **Retain:** PV vẫn còn, dữ liệu giữ nguyên, quản trị viên xử lý thủ công.
- **Delete:** PV và phần lưu trữ bên dưới bị xoá cùng PVC.

> **Cảnh báo:** với `Delete`, lệnh `kubectl delete pvc data` sẽ xoá luôn dữ liệu, không hoàn tác được. Trước khi xoá PVC của dữ liệu quan trọng, hãy sao lưu, và xem chính sách bằng `kubectl get pv`. Chính sách của PV có thể đổi sang `Retain` (xem tài liệu "Change the Reclaim Policy of a PersistentVolume" trong phần tham khảo).

Một PVC đang được Pod dùng sẽ được Kubernetes bảo vệ: khi bạn xoá, nó chỉ thật sự bị xoá sau khi không còn Pod nào dùng.

## Mở rộng dung lượng

Nếu StorageClass đặt `allowVolumeExpansion: true`, bạn có thể tăng `spec.resources.requests.storage` của PVC rồi áp dụng lại. Bạn chỉ tăng được, không giảm.

## Kiểm tra

1. `kubectl get storageclass` có lớp mặc định.
2. `kubectl -n demo get pvc` ở trạng thái `Bound` (hoặc `Pending` hợp lý với `WaitForFirstConsumer`).
3. Xoá Pod rồi tạo lại, dữ liệu vẫn còn.
4. `kubectl get pv` cho thấy PV tương ứng và chính sách reclaim.

## Lỗi hay gặp

- **Không có StorageClass mặc định:** PVC kẹt ở `Pending`.
- **Nhầm `ReadWriteOnce` với nhiều Pod trên nhiều node:** Pod thứ hai không gắn được volume.
- **Xoá PVC khi reclaim là `Delete`:** mất dữ liệu.
- **Đặt PVC ở namespace khác Pod:** Pod không tìm thấy claim.
- **Tưởng volume là bản sao lưu:** PV không thay thế sao lưu; hãy sao lưu riêng.

## Tóm lại

PVC là yêu cầu, PV là phần lưu trữ, StorageClass tự động hoá việc cấp phát. Pod chỉ cần tham chiếu PVC, và dữ liệu sống tách khỏi vòng đời Pod. Luôn kiểm tra chính sách reclaim và có sao lưu trước khi xoá.

## Tham khảo

- [Persistent Volumes (tài liệu Kubernetes)](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Change the Reclaim Policy of a PersistentVolume](https://kubernetes.io/docs/tasks/administer-cluster/change-pv-reclaim-policy/)
