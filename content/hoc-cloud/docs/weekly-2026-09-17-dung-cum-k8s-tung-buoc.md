# 17-09 · Dựng cụm Kubernetes từng bước

Buổi 17.09.2026 dựng một cụm Kubernetes 3 node bằng kubeadm: làm hết 12 bước dưới đây là có một cụm chạy thật, kèm một ứng dụng web mở được từ trình duyệt. Mọi lệnh ở đây đã chạy thật trên cụm lab hôm đó (Kubernetes v1.31.14, containerd 2.3.3, flannel v0.28.9) — không phải lệnh chép lại từ tài liệu. Giải thích sâu cho từng bước nằm ở [[Dựng cụm Kubernetes bằng kubeadm]]; cụm dựng xong trông thế nào nằm ở [[17-09 · Kiến trúc cụm lab Kubernetes]].

## Trước khi bắt đầu

| Hạng mục | Giá trị |
| --- | --- |
| Phiên bản | Kubernetes 1.31 |
| Hệ điều hành | Ubuntu 22.04 |
| Mạng cho Pod | flannel |
| Số máy | 3 máy ảo |
| Cấu hình tối thiểu | 2 vCPU · 2 GB |
| Quyền cần có | root |

Ba máy phải thấy nhau qua mạng và mỗi máy có một tên riêng. Bài này dùng `<ADDR-1>` làm máy điều khiển, `.183` và `.184` làm máy chạy ứng dụng. Anh thay ba số này bằng IP máy của mình rồi làm theo, phần còn lại giữ nguyên.

Mọi lệnh chạy bằng `root`. Nếu đang là user thường thì gõ `sudo -i` một lần ở đầu.

## Phần A · Làm giống hệt nhau trên cả ba máy

### Bước 1 — Đặt tên máy và khai địa chỉ cho nhau

Chạy trên: cả 3 máy.

Kubernetes gọi các máy bằng tên chứ không bằng IP, nên mỗi máy phải có tên riêng và phải tra được tên của hai máy kia. Trùng tên là cụm coi hai máy làm một.

```bash
# đổi tên cho đúng máy đang đứng: cloud-1 / cloud-2 / cloud-3
hostnamectl set-hostname dattqh-cloud-1

cat >> /etc/hosts <<'EOF'
<ADDR-1> dattqh-cloud-1
<ADDR-2> dattqh-cloud-2
<ADDR-3> dattqh-cloud-3
EOF
```

**Kết quả đúng:** `hostname` trả về đúng tên vừa đặt, và `ping dattqh-cloud-2` ra được IP.

### Bước 2 — Tắt swap

Chạy trên: cả 3 máy.

Kubernetes tính toán bộ nhớ dựa trên RAM thật; còn swap thì kubelet từ chối khởi động ([[Kubernetes: khái niệm và mô hình cụm lab]]). Vì vậy phải tắt ngay và tắt luôn trong `/etc/fstab` để lần khởi động lại không bật lại. Lệnh đầu tiên đặt múi giờ cho máy.

```bash
timedatectl set-timezone Asia/Ho_Chi_Minh

swapoff -a
sed -ri '/\sswap\s/s/^#?/#/' /etc/fstab
```

**Kết quả đúng:** `swapon --show` không in ra dòng nào.

### Bước 3 — Bật hai module mạng của nhân Linux

Chạy trên: cả 3 máy.

Hai module này phục vụ hai việc khác nhau, đừng gộp làm một: `overlay` là lớp lưu trữ để xếp chồng các tầng của image, còn `br_netfilter` mới là thứ cho tường lửa nhìn thấy gói tin chạy qua cầu mạng của Pod. Thiếu cái thứ hai thì cụm vẫn dựng xong rồi mạng Pod hỏng về sau.

```bash
cat > /etc/modules-load.d/k8s.conf <<'EOF'
overlay
br_netfilter
EOF

modprobe overlay
modprobe br_netfilter

cat > /etc/sysctl.d/k8s.conf <<'EOF'
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
EOF

sysctl --system
```

**Kết quả đúng:**

```text
lsmod | grep -E 'overlay|br_netfilter'   → có cả hai dòng
sysctl -n net.ipv4.ip_forward            → 1
```

### Bước 4 — Cài bốn gói lẻ mà tài liệu hay quên

Chạy trên: cả 3 máy.

Thiếu `conntrack` là `kubeadm init` dừng ngay lập tức. Ba gói kia không chặn cài đặt nhưng thiếu thì vướng về sau: `socat` cần cho lệnh chuyển cổng, `ethtool` để hết dòng cảnh báo, `jq` để đọc kết quả dạng JSON. Vì sao từng gói cần: [[Dựng cụm Kubernetes bằng kubeadm]].

```bash
apt-get update
apt-get install -y conntrack socat ethtool jq \
                   curl ca-certificates gnupg apt-transport-https
```

### Bước 5 — Bật đường nói chuyện giữa Kubernetes và containerd

Chạy trên: cả 3 máy.

Gói containerd cài kèm Docker mặc định **tắt** đường mà Kubernetes dùng để gọi nó; sinh lại file cấu hình mặc định là đường đó tự bật. Sinh lại chứ không sửa tay — sửa tay rất dễ sót. Vì sao phải sửa thêm cgroup driver và bản image `pause`: [[Dựng cụm Kubernetes bằng kubeadm]].

```bash
# giữ một bản cũ phòng khi cần quay lại
cp /etc/containerd/config.toml /etc/containerd/config.toml.bak-$(date +%F)

containerd config default > /etc/containerd/config.toml

# dùng chung bộ quản lý tài nguyên với hệ điều hành
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

# dùng đúng bản image nền mà Kubernetes 1.31 tải về
sed -i 's#registry.k8s.io/pause:3.10.2#registry.k8s.io/pause:3.10#' /etc/containerd/config.toml

systemctl restart containerd
ctr plugins ls | grep cri
```

**Kết quả đúng:**

```text
io.containerd.grpc.v1    cri    ...    ok
```

Chữ `ok` ở cuối dòng. Nếu là `skip` thì đường gọi vẫn đang tắt.

### Bước 6 — Trỏ nơi tải image qua máy trung chuyển

Chạy trên: cả 3 máy.

Docker Hub giới hạn số lần tải theo địa chỉ IP, cả lớp cùng tải là dính ngay. Khai một máy trung chuyển thì tránh được. Lưu ý chỗ này rất dễ sai: **phải khai bằng file riêng** trong thư mục `conf.d`, đừng nối thêm dòng vào cuối file cấu hình chính.

```bash
mkdir -p /etc/containerd/conf.d /etc/containerd/certs.d/docker.io

cat > /etc/containerd/conf.d/10-registry-mirror.toml <<'EOF'
version = 3

[plugins.'io.containerd.cri.v1.images'.registry]
  config_path = '/etc/containerd/certs.d'
EOF

cat > /etc/containerd/certs.d/docker.io/hosts.toml <<'EOF'
server = "https://docker.io"

[host."https://mirror.gcr.io"]
  capabilities = ["pull", "resolve"]

[host."https://registry-1.docker.io"]
  capabilities = ["pull", "resolve"]
EOF

cat > /etc/crictl.yaml <<'EOF'
runtime-endpoint: unix:///run/containerd/containerd.sock
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 10
EOF

systemctl restart containerd
containerd config dump | grep -A2 "cri.v1.images'.registry\]"
```

**Kết quả đúng:**

```text
[plugins.'io.containerd.cri.v1.images'.registry]
  config_path = '/etc/containerd/certs.d'
```

Kiểm bằng `containerd config dump` chứ không mở file ra xem, vì lệnh này in cấu hình containerd *thật sự đang dùng* sau khi đã ghép các file lại — xem thêm [[Dựng cụm Kubernetes bằng kubeadm]].

### Bước 7 — Cài ba lệnh chính của Kubernetes

Chạy trên: cả 3 máy.

`kubeadm` dùng để dựng cụm, `kubelet` là tiến trình chạy thường trực trên mỗi máy, `kubectl` là lệnh để ra lệnh cho cụm. Dòng `apt-mark hold` khoá phiên bản lại để lần nâng cấp hệ điều hành không vô tình nâng luôn Kubernetes lên bản khác.

```bash
mkdir -p /etc/apt/keyrings

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key \
  | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' \
  > /etc/apt/sources.list.d/kubernetes.list

apt-get update
apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
systemctl enable kubelet
```

**Kết quả đúng:**

```text
kubeadm version -o short   → v1.31.14
```

## Phần B · Chỉ làm trên máy điều khiển

### Bước 8 — Dựng cụm

Chạy trên: máy `.182`.

Tải image trước cho lệnh dựng chạy nhanh và dễ nhìn lỗi. Ba tham số của lệnh dựng: địa chỉ mà máy này công bố ra cho các máy khác tìm tới, dải địa chỉ cấp cho Pod, và phiên bản muốn dùng.

```bash
kubeadm config images pull --kubernetes-version=v1.31.14

kubeadm init \
  --apiserver-advertise-address=<ADDR-1> \
  --pod-network-cidr=10.244.0.0/16 \
  --kubernetes-version=v1.31.14
```

**Kết quả đúng:**

```text
Your Kubernetes control-plane has initialized successfully!

kubeadm join <ADDR-1>:<PORT> --token ... \
    --discovery-token-ca-cert-hash sha256:...
```

**Chép ngay hai dòng `kubeadm join` cuối cùng ra chỗ khác** — lát nữa cần dùng. Lỡ mất cũng không sao, bước 11 có cách lấy lại.

**Nếu dừng ở dòng conntrack:** lệnh dừng với `[ERROR FileExisting-conntrack]` nghĩa là bước 4 chưa làm. Cài `conntrack` rồi chạy lại đúng lệnh trên, không cần đổi gì cả.

### Bước 9 — Cho phép dùng lệnh kubectl

Chạy trên: máy `.182`.

Lệnh `kubectl` cần một file chứng thực để biết nói chuyện với cụm nào và có quyền gì. Ba dòng đầu chép file đó về thư mục nhà.

```bash
mkdir -p $HOME/.kube
cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
chown $(id -u):$(id -g) $HOME/.kube/config

kubectl get nodes
```

**Kết quả đúng:**

```text
NAME             STATUS     ROLES           AGE   VERSION
dattqh-cloud-1   NotReady   control-plane   60s   v1.31.14
```

`NotReady` ở đây **không phải lỗi**: máy chưa có phần mạng cho Pod nên cụm tự đánh dấu là chưa sẵn sàng ([[Kubernetes: khái niệm và mô hình cụm lab]]). Bước tiếp theo sẽ xử lý.

### Bước 10 — Cài phần mạng cho Pod

Chạy trên: máy `.182`.

Kubernetes không tự làm phần mạng giữa các Pod, phải cắm thêm. Bài này dùng flannel vì nhẹ nhất và dải mặc định của nó khớp đúng dải đã khai ở bước 8.

```bash
kubectl apply -f https://github.com/flannel-io/flannel/releases/download/v0.28.9/kube-flannel.yml

kubectl -n kube-flannel rollout status ds/kube-flannel-ds --timeout=180s
kubectl get nodes
```

**Kết quả đúng:**

```text
NAME             STATUS   ROLES           AGE    VERSION
dattqh-cloud-1   Ready    control-plane   2m     v1.31.14
```

Đã chuyển sang `Ready`. Nếu sau 2 phút vẫn `NotReady` thì xem bảng lỗi cuối bài.

## Phần C · Nối hai máy còn lại vào cụm

### Bước 11 — Nối máy chạy ứng dụng vào cụm

Chạy trên: máy `.183` và `.184`.

Dán nguyên lệnh đã chép ở bước 8 vào từng máy. Lỡ mất hoặc quá 24 tiếng thì quay lại máy điều khiển xin lệnh mới bằng dòng đầu tiên dưới đây.

```bash
# chạy trên máy .182 nếu cần lấy lại lệnh nối
kubeadm token create --print-join-command

# rồi dán kết quả vào máy .183 và .184, dạng như sau
kubeadm join <ADDR-1>:<PORT> --token XXXXXX \
  --discovery-token-ca-cert-hash sha256:YYYYYY
```

**Kết quả đúng:**

```text
This node has joined the cluster.
```

## Phần D · Kiểm tra cụm chạy thật

### Bước 12 — Chạy thử một trang web trên cụm

Chạy trên: máy `.182`.

Đây là bước nghiệm thu. Tạo hai bản sao một trang web, mở nó ra ngoài, rồi gọi thử từ cả ba máy — gọi vào máy nào cũng phải ra trang, kể cả máy không chạy bản sao nào.

```bash
kubectl wait --for=condition=Ready node --all --timeout=240s
kubectl get nodes -o wide

kubectl create deployment web --image=nginx --replicas=2
kubectl expose deployment web --type=NodePort --port=80

kubectl get pods -o wide
kubectl get svc web
```

**Kết quả đúng:**

```text
NAME   TYPE       CLUSTER-IP      PORT(S)        AGE
web    NodePort   10.107.187.174  80:31846/TCP   5s
```

Con số sau dấu hai chấm (ở đây là `31846`) là cổng để gọi từ ngoài. Máy anh sẽ ra số khác, lấy đúng số của mình rồi thay vào lệnh dưới.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<ADDR-1>:<PORT>/
curl -s -o /dev/null -w "%{http_code}\n" http://<ADDR-2>:<PORT>/
curl -s -o /dev/null -w "%{http_code}\n" http://<ADDR-3>:<PORT>/
```

**Kết quả đúng:**

```text
200
200
200
```

Ba lần `200` là xong. Mở trình duyệt vào cùng địa chỉ đó cũng ra trang chào của nginx.

## Gặp lỗi thì làm gì

Sáu lỗi dưới đây đều đã gặp thật khi dựng cụm này.

| Thấy gì | Nguyên nhân | Xử lý |
| --- | --- | --- |
| `[ERROR FileExisting-conntrack]` | Chưa cài gói `conntrack` | Làm lại bước 4 rồi chạy lại `kubeadm init`, không đổi tham số |
| Node đứng `NotReady` mãi | Chưa cài phần mạng cho Pod | Làm bước 10. Nếu đã làm, xem `kubectl -n kube-flannel get pod` |
| `ctr plugins ls` cho `skip` chứ không phải `ok` | File cấu hình containerd vẫn đang tắt đường gọi | Làm lại bước 5 — phải *sinh lại* file, không sửa tay |
| containerd không khởi động, báo `table registry already exists` | Đã nối thêm một khối cấu hình trùng tên vào file chính | Bỏ phần vừa nối, khai bằng file riêng trong `conf.d` như bước 6 |
| Image tải rất chậm hoặc báo hết lượt tải | Máy trung chuyển chưa được khai đúng chỗ | Kiểm bằng `containerd config dump`, không kiểm bằng cách mở file |
| `kubeadm join` báo token không hợp lệ | Token chỉ sống 24 tiếng | Xin lệnh mới bằng `kubeadm token create --print-join-command` |

## Muốn làm lại từ đầu

Chạy trên cả ba máy rồi quay lại bước 8. Lệnh này xoá sạch cụm, không xoá các gói đã cài nên không phải làm lại phần A.

```bash
kubeadm reset -f
rm -rf /etc/cni/net.d $HOME/.kube
iptables -F && iptables -t nat -F
systemctl restart docker containerd
```

## Bảng nghiệm thu

| Hạng mục | Kiểm bằng |
| --- | --- |
| Ba máy khác tên nhau, ping được nhau | `hostname` · `ping` |
| Swap đã tắt trên cả ba máy | `swapon --show` → rỗng |
| Đường gọi containerd đã bật trên cả ba máy | `ctr plugins ls \| grep cri` → `ok` |
| Ba node đều Ready | `kubectl get nodes` |
| Mọi Pod hệ thống đều Running | `kubectl get pod -A` |
| Gọi cổng ứng dụng từ cả ba máy đều ra 200 | `curl http://IP:cổng/` |
