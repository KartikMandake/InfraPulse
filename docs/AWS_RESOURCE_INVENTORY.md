# InfraPulse — AWS Resource Inventory

**Platform**: InfraPulse v2.4.0  
**Phase**: Phase 28 — Controlled Cloud Deployment  
**Target Region**: `ap-south-1` (Mumbai)  
**AWS Account ID**: `********3579` (Masked per Security Guidelines)  
**Report Generated**: November 1, 2026  

---

## 1. Discovered Pre-Existing AWS Resources (Read-Only Audit)

The following resources were discovered during the initial read-only discovery of region `ap-south-1`. In compliance with Safety Rule 10 (*"Do not modify existing AWS resources"*), these resources were strictly preserved and left completely untouched:

| Resource ID | Resource Type | Specifications / State | Tags & Metadata | Impact on InfraPulse Deployment |
| :--- | :--- | :--- | :--- | :--- |
| `reachify-postgres` | RDS DB Instance | Engine: PostgreSQL 16<br/>Class: `db.t4g.micro`<br/>Status: `available` | Project: `reachify`<br/>Environment: `production` | **Consumes RDS Free Tier allowance** (750 hours/mo). Prevents zero-cost managed database for InfraPulse. |
| `i-09bd1ec5f0c4899ee` | EC2 Instance | Type: `t3.micro`<br/>State: `stopped` | Name: `reachify-ec2-free-tier`<br/>Project: `reachify`<br/>CostTier: `AWS-Free-Tier-750-Hrs`<br/>ManagedBy: `Terraform` | Account already provisioned for EC2 Free Tier. Stopped instances still incur attached EBS costs. |
| `vol-0a178e73c493ec535` | EBS Volume | Size: 20 GB<br/>Type: `gp3`<br/>State: `in-use`<br/>Attachment: `i-09bd1ec5f0c4899ee` | Tag: ManagedBy Terraform | **Consumes 20 GB of 30 GB Free Tier EBS allowance**. Leaves only 10 GB Free Tier buffer. |
| `eipalloc-03ccb85a9dcf8567e` | Elastic IPv4 Address | IP: `13.207.125.119`<br/>ENI: `eni-0a9b721dd5ddb9aaa`<br/>Owner: `416121583579`<br/>Service: `rds` | Domain: `vpc` | Dedicated to `reachify-postgres`. Incurs standard public IPv4 hourly rate. |

---

## 2. InfraPulse Resources Created in Phase 28

> [!IMPORTANT]
> **Zero Resources Created**:
> In accordance with Critical Financial and Safety Constraints 1, 8, 9, and the Pre-Deployment Cost Gate, **zero (0) AWS resources have been provisioned**.
> Provisioning was halted at Stage 0 because ₹0 out-of-pocket deployment could not be verified on this account without incurring non-zero EBS, IPv4, and compute fees.

| Resource Type | Resource Count | Status | Notes |
| :--- | :--- | :--- | :--- |
| Amazon EC2 Instances | **0** | NOT PROVISIONED | Awaiting user budget approval |
| Amazon EBS Volumes | **0** | NOT PROVISIONED | Awaiting user budget approval |
| Elastic IPv4 Addresses | **0** | NOT PROVISIONED | Awaiting user budget approval |
| Security Groups | **0** | NOT PROVISIONED | Awaiting user budget approval |
| RDS Databases | **0** | NOT PROVISIONED | Disqualified due to non-zero cost |
| Application Load Balancers | **0** | NOT PROVISIONED | Disqualified due to non-zero cost |

---

## 3. Planned Blueprint Resources (Option A — Pending Approval)

The following resources represent the minimal validated deployment footprint if explicit user authorization is provided:

| Planned Resource | Configuration | Region / AZ | Estimated Recurring Charge | Required Tags |
| :--- | :--- | :--- | :--- | :--- |
| **EC2 Instance** | `t4g.small` (ARM64, 2 vCPU, 2 GB RAM) | `ap-south-1a` | ~$16.35 / month | `Project: InfraPulse`<br/>`Environment: Production` |
| **Root EBS Volume** | 20 GB `gp3`, Encrypted (`aws/ebs`) | `ap-south-1a` | ~$1.82 / month | `Project: InfraPulse`<br/>`Name: infrapulse-root-vol` |
| **Data EBS Volume** | 30 GB `gp3`, Encrypted (`aws/ebs`) | `ap-south-1a` | ~$2.74 / month | `Project: InfraPulse`<br/>`Name: infrapulse-postgres-data` |
| **Elastic IP** | 1 IPv4 public address | `ap-south-1` | ~$3.65 / month | `Project: InfraPulse` |
| **Security Group** | `infrapulse-prod-sg` (80, 443, 22 restricted) | `ap-south-1` | $0.00 | `Project: InfraPulse` |
| **IAM Instance Profile**| `InfraPulseWorkloadProfile` | Global / `ap-south-1` | $0.00 | `Project: InfraPulse` |

---

## 4. Tagging Governance & Resource Identification Standard

All future resources provisioned for InfraPulse MUST adhere to the following mandatory resource tagging taxonomy:

```yaml
Tags:
  Project: "InfraPulse"
  Environment: "Production"
  ApplicationVersion: "2.4.0"
  ManagedBy: "InfraPulseDeployment"
  Owner: "PlatformEngineering"
  CostCenter: "InfraPulse-Ops"
  DataClassification: "Confidential"
```
Any untagged resource discovered in region `ap-south-1` will be flagged by drift governance as unauthorized.

