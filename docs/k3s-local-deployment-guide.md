# InfraPulse — Local Kubernetes (K3s) Operations Guide

This guide details how to run, inspect, scale, update, and recover InfraPulse on a local K3s or Minikube cluster using standard Kubernetes manifests and Kustomize overlays.

---

## 1. Prerequisites & Cluster Installation

K3s is a lightweight, certified Kubernetes distribution ideal for local development, edge computing, and low-resource environments (under 512MB RAM for control plane).

### 1.1 Installing K3s (Linux / WSL2)
```bash
# Install lightweight K3s without embedded Traefik if you prefer custom ingress, or with default Traefik
curl -sfL https://get.k3s.io | sh -

# Export kubeconfig for unprivileged access
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
export KUBECONFIG=~/.kube/config
```

### 1.2 Verify Cluster & Ingress Controller
```bash
kubectl get nodes
kubectl get pods -n kube-system
```

---

## 2. Deploying InfraPulse with Kustomize

### 2.1 Prepare Local Docker Images
Before deploying, build the local images or load them into the K3s containerd registry:
```bash
# Build backend and frontend images
docker build -t infrapulse-backend:latest backend/
docker build -t infrapulse-frontend:latest frontend/

# If using K3s with containerd, import the images directly:
docker save infrapulse-backend:latest | sudo k3s ctr images import -
docker save infrapulse-frontend:latest | sudo k3s ctr images import -
```

### 2.2 Configure Local Secrets
Review `infra/kubernetes/base/secret-template.yaml`. If custom credentials are desired, apply a customized secret or use the default local development secret:
```bash
# Base template includes sanitized non-secret placeholders for local testing
kubectl apply -k infra/kubernetes/overlays/local
```

### 2.3 Verify Manifest Build Output (Dry-Run)
Inspect the compiled YAML before applying to the cluster:
```bash
kubectl kustomize infra/kubernetes/overlays/local
```

### 2.4 Apply Manifests to Local K3s
```bash
kubectl apply -k infra/kubernetes/overlays/local
```

Expected output:
```
namespace/infrapulse created
configmap/infrapulse-config created
secret/infrapulse-secrets created
service/backend-service created
service/frontend-service created
service/postgres-service created
deployment.apps/backend created
deployment.apps/frontend created
deployment.apps/worker created
statefulset.apps/postgres created
ingress.networking.k8s.io/infrapulse-ingress created
networkpolicy.networking.k8s.io/backend-network-policy created
networkpolicy.networking.k8s.io/postgres-network-policy created
```

---

## 3. Monitoring Pods, Services & Probes

### 3.1 Check Pod Status
```bash
kubectl get pods -n infrapulse -o wide
```
All pods should transition from `ContainerCreating` to `Running` (1/1 Ready):
- `postgres-0`
- `backend-<replicaset>-<hash>`
- `worker-<replicaset>-<hash>`
- `frontend-<replicaset>-<hash>`

### 3.2 Check Services & Endpoints
```bash
kubectl get svc -n infrapulse
kubectl get endpoints -n infrapulse
```

### 3.3 Check Ingress Routing
```bash
kubectl get ingress -n infrapulse
```

---

## 4. Accessing InfraPulse Locally

### Option A: Via Built-in K3s Traefik Ingress
Add `infrapulse.local` to your local hosts file (`/etc/hosts` or `C:\Windows\System32\drivers\etc\hosts`):
```text
127.0.0.1 infrapulse.local
```
Then navigate to:
```
http://infrapulse.local/
http://infrapulse.local/api/health
```

### Option B: Via Port-Forwarding (Direct Diagnostic Mode)
```bash
# Forward Frontend Web UI to port 8080
kubectl port-forward svc/frontend-service 8080:8080 -n infrapulse

# Forward Backend API directly to port 5000 (in a separate terminal)
kubectl port-forward svc/backend-service 5000:5000 -n infrapulse
```

---

## 5. Viewing Logs & Debugging

### 5.1 Real-Time Streaming Logs
```bash
# Follow backend logs with structured JSON correlation IDs
kubectl logs -f -l app.kubernetes.io/component=backend -n infrapulse

# Follow worker delivery logs
kubectl logs -f -l app.kubernetes.io/component=worker -n infrapulse

# Follow PostgreSQL logs
kubectl logs -f postgres-0 -n infrapulse
```

### 5.2 Describe Pods for Failed Health Probes
```bash
kubectl describe pod -l app.kubernetes.io/component=backend -n infrapulse
```

---

## 6. Rolling Updates & Zero-Downtime Rollbacks

### 6.1 Rolling Out a New Image
When a new container version is built:
```bash
kubectl set image deployment/backend backend=infrapulse-backend:v2.5.0 -n infrapulse
kubectl set image deployment/frontend frontend=infrapulse-frontend:v2.5.0 -n infrapulse
```

### 6.2 Monitor Rollout Progress
```bash
kubectl rollout status deployment/backend -n infrapulse
kubectl rollout status deployment/frontend -n infrapulse
```

### 6.3 Immediate Rollback
If a regression or configuration defect occurs:
```bash
# Roll back backend to previous revision
kubectl rollout undo deployment/backend -n infrapulse

# Inspect rollout history
kubectl rollout history deployment/backend -n infrapulse
```

---

## 7. PostgreSQL Persistence & Recovery

### 7.1 Persistent Volume Claim (PVC)
PostgreSQL storage uses a StatefulSet with VolumeClaimTemplates bound to K3s's built-in `local-path` provisioner:
```bash
kubectl get pvc -n infrapulse
```

### 7.2 Simulating Pod Failure / Restart
Deleting the PostgreSQL pod demonstrates that state survives pod recreation:
```bash
kubectl delete pod postgres-0 -n infrapulse
```
StatefulSet recreates `postgres-0` and automatically reattaches the existing `pgdata-postgres-0` PVC with zero data loss.

### 7.3 Database Snapshot inside Pod
```bash
kubectl exec -it postgres-0 -n infrapulse -- pg_dump -U postgres -d infrapulse -F c > ./backups/k8s_postgres_backup.sql
```

### 7.4 Database Restore inside Pod
```bash
kubectl exec -i postgres-0 -n infrapulse -- pg_restore -U postgres -d infrapulse --clean --if-exists < ./backups/k8s_postgres_backup.sql
```

---

## 8. Teardown
To remove the local Kubernetes deployment:
```bash
# Delete all resources defined in overlay (preserves PVCs by default in StatefulSets)
kubectl delete -k infra/kubernetes/overlays/local

# To completely purge database data and persistent volumes:
kubectl delete pvc pgdata-postgres-0 -n infrapulse
kubectl delete namespace infrapulse
```

