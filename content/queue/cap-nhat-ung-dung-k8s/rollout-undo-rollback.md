---
title: Quay lại phiên bản cũ trên Kubernetes bằng kubectl rollout undo
tags: kubernetes, rollback, kubectl, deployment, sự-cố
type: process
---

> [!TLDR]
> - Khi bản mới lỗi, `kubectl rollout undo deployment/<tên>` đưa Deployment về revision liền trước; thêm `--to-revision=N` để chọn mốc cụ thể.
> - Kubernetes không tự rollback khi cập nhật thất bại: nó chỉ dừng tiến triển, quyết định quay lại là của bạn.
> - Chỉ phần `template` của Pod được hoàn lại; số bản sao và cấu hình nằm ngoài template thì không.

## Mở đầu

Dù thử kỹ đến đâu, thỉnh thoảng bản mới vẫn gặp lỗi trên môi trường thật. Lúc đó điều quan trọng là quay lại trạng thái chạy tốt nhanh và có kiểm soát. Deployment lưu lịch sử các lần cập nhật dưới dạng revision, nên quay lại chỉ là một lệnh. Bài này giả định bạn đã có Deployment `web` như trong bài về Deployment và rolling update.

## Quy trình xử lý khi bản mới có vấn đề

### 1. Nhận ra vấn đề

Sau mỗi lần cập nhật, chạy:

```bash
kubectl -n thu-nghiem rollout status deployment/web --timeout=120s
```

Lệnh trả về thành công khi lượt cập nhật hoàn tất, và thoát với mã lỗi khác 0 khi quá thời gian hoặc khi Deployment vượt `progressDeadlineSeconds` (mặc định 600 giây). Cách này tiện để đặt vào quy trình tự động: nếu `rollout status` thất bại thì chạy bước hoàn tác.

Cũng cần nhìn vào Pod, vì ứng dụng có thể chạy "xanh" về mặt Kubernetes nhưng lỗi về mặt nghiệp vụ:

```bash
kubectl -n thu-nghiem get pods -l app=web
kubectl -n thu-nghiem describe deployment web
kubectl -n thu-nghiem logs deployment/web --tail=50
```

### 2. Xem các revision có sẵn

```bash
kubectl -n thu-nghiem rollout history deployment/web
kubectl -n thu-nghiem rollout history deployment/web --revision=2
```

Lệnh thứ hai in chi tiết Pod template của revision 2 (image, biến môi trường...) để bạn chắc chắn mình sắp quay về đúng bản cần. Số revision được giữ lại bị giới hạn bởi `revisionHistoryLimit` (mặc định 10). Nếu đặt giá trị này bằng 0, bạn mất khả năng quay lại.

### 3. Hoàn tác

Về revision liền trước:

```bash
kubectl -n thu-nghiem rollout undo deployment/web
```

Về một revision cụ thể:

```bash
kubectl -n thu-nghiem rollout undo deployment/web --to-revision=2
```

Quá trình hoàn tác cũng là một lượt rolling update, nên vẫn tuân theo `maxSurge` và `maxUnavailable` và không làm gián đoạn dịch vụ. Hãy theo dõi nó bằng `kubectl rollout status` như thường lệ.

### 4. Ghi lại và điều tra

Sau khi ổn định, ghi chú lý do để người khác hiểu lịch sử:

```bash
kubectl -n thu-nghiem annotate deployment/web \
  kubernetes.io/change-cause="rollback ve 1.26 do loi o ban 1.27" --overwrite
```

Rồi điều tra nguyên nhân bản lỗi ở môi trường thử, không phải ở môi trường đang chạy.

## Kiểm tra

- `kubectl -n thu-nghiem rollout history deployment/web` cho thấy revision cũ được đánh số lại thành revision mới nhất: hoàn tác không "xoá" lịch sử mà tạo một revision mới có nội dung của bản cũ.
- `kubectl -n thu-nghiem get deployment web -o jsonpath='{.spec.template.spec.containers[0].image}'` in ra image mong muốn.
- Các Pod đều `READY` và ứng dụng trả lời đúng.

## Lỗi hay gặp

- **Tưởng undo hoàn lại mọi thứ:** chỉ Pod template được khôi phục. Nếu bạn đã đổi `replicas` bằng `kubectl scale`, hay sửa ConfigMap/Secret mà Deployment tham chiếu, những thay đổi ấy không được tự hoàn lại. Về cấu hình, xem [[ConfigMap và Secret: tách cấu hình khỏi image ứng dụng trên Kubernetes]].
- **Undo khi Deployment đang tạm dừng (`pause`):** hãy `rollout resume` trước, nếu không lượt hoàn tác sẽ không chạy.
- **Lịch sử rỗng hoặc thiếu mốc:** do `revisionHistoryLimit` quá thấp hoặc ReplicaSet cũ đã bị dọn. Với bản quan trọng, hãy lưu manifest trong Git để triển khai lại đúng bản đó.
- **Chạy lệnh nhầm cụm hoặc namespace:** kiểm tra `kubectl config current-context` trước khi hoàn tác trên môi trường thật.
- **Lẫn giữa `undo` và `restart`:** `rollout restart` chỉ khởi động lại Pod với cùng cấu hình, không đưa về phiên bản cũ.

## Tóm lại

`kubectl rollout undo` là phao cứu sinh nhanh, nhưng chỉ hiệu quả khi bạn phát hiện sớm (nhờ `rollout status` và readiness probe), còn giữ đủ revision và hiểu rõ phạm vi nó hoàn lại. Hãy coi nó là biện pháp tạm thời để khôi phục dịch vụ, còn nguyên nhân gốc vẫn phải sửa trong mã và manifest.

## Tham khảo

- [Kubernetes: Deployments, mục Rolling Back a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment)
- [kubectl rollout undo](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/)
- [kubectl rollout status](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_status/)
