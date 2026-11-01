# InfraPulse Infrastructure Discovery Report

**Audit Date**: 2026-11-01T15:18:00+05:30  
**Evaluator**: Principal Cloud Architect & SRE  
**Environment**: Local Host + Real Ambient Cloud  
**Status**: `COMPLETED WITH ACCURATE ATTRIBUTION`  

---

## 1. Discovered Real Infrastructure Resources

### 1.1 AWS Ambient Cloud Discovery (`ap-south-1`)
- **AWS Caller Identity**: `arn:aws:iam::416121583579:root` (Account: `416121583579`)
- **Region**: `ap-south-1` (Mumbai)
- **Discovered Compute Resources**:
  - **EC2 Instance**: `i-09bd1ec5f0c4899ee` (`reachify-ec2-free-tier`)
  - **State**: `stopped` (Code: 80, User Initiated Shutdown)
  - **Instance Type**: `t3.micro` (x86_64, 1 Core, 2 Threads)
  - **Attached Volume**: `vol-0a178e73c493ec535` (`/dev/sda1`, EBS attached)
  - **Security Group**: `sg-028637b8d5506eed8` (`reachify-app-sg`)
  - **VPC Subnet**: `subnet-00473f6f461e7a7f5` in `vpc-0aa624567f0b25549`
- **Cost Invariant Preserved**: Instance remains stopped; zero out-of-pocket charges incurred. Zero mutating API calls executed.

### 1.2 GitHub Source Repository
- **Repository**: `KartikMandake/InfraPulse`
- **Tracked Commits**: Verified latest commit `c18be92` and release commit `5711785`.
- **Live Push Webhook**: Verified live delivery `del-1793526548482` for branch `kartik`.

### 1.3 Local Host Environment
- **Host System**: Windows 11 Enterprise (16 GB RAM, 58 GB Free Storage on Drive D:).
- **PostgreSQL 16**: Port `5434`, database `infrapulse_ops_prod` active and verified.

---

## 2. Inactive / Blocked Infrastructure Discovery

1. **Docker Engine**: Docker Desktop daemon inactive on host (`ENOENT //./pipe/docker_engine`). Correctly classified as **`BLOCKED`** in integration repository.
2. **Kubernetes**: No active cluster reachable in local environment (`ENOTFOUND kubernetes.default.svc`). Correctly classified as **`NOT CONFIGURED`**.
