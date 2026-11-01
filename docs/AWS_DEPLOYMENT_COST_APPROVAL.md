# InfraPulse — AWS Deployment Cost Approval & FinOps Gate

**Platform**: InfraPulse v2.4.0  
**Phase**: Phase 28 — Controlled Cloud Deployment  
**AWS Account**: `********3579`  
**Target Region**: `ap-south-1` (Mumbai)  
**Authorized Out-of-Pocket Budget**: **₹0.00 INR ($0.00 USD)**  
**FinOps Gate Status**: **HARD STOP ENFORCED — PROVISIONING BLOCKED**  

---

## 1. Executive Summary & Cost Gate Status

Under Section 2 and Section 5 of the Phase 28 specifications:
> *"The user's out-of-pocket budget is ₹0... If ₹0 deployment cannot be verified, STOP before provisioning and recommend a safe alternative such as local deployment."*

An authorized, strictly read-only inspection of AWS account `********3579` in region `ap-south-1` was executed. The inspection discovered:
1. **Existing RDS Instance**: `reachify-postgres` (`db.t4g.micro`) is active and available.
2. **Existing EBS Volume**: `vol-0a178e73c493ec535` (20 GB gp3) is currently allocated.
3. **Existing Elastic IPv4 Address**: `13.207.125.119` is allocated and associated with RDS.
4. **Existing EC2 Instance**: `i-09bd1ec5f0c4899ee` (`t3.micro`, project reachify) is stopped.

### Key Financial Finding:
- **Free Tier Exhaustion**: AWS Free Tier limits (e.g. 30 GB EBS, 750 hours RDS `db.t4g.micro`, 750 hours EC2 `t3.micro`) apply at the **AWS Account level**, not per project or VPC. The existing `reachify` project consumes the RDS Free Tier allowance and 20 GB of the 30 GB EBS allowance. Provisioning an additional 20–30 GB volume for InfraPulse would exceed the 30 GB threshold, immediately generating invoiced storage fees.
- **Mandatory IPv4 Charge**: Since February 1, 2024, AWS charges **$0.005/hour ($3.65/month)** for all public IPv4 addresses, even when attached to a running EC2 instance.
- **Absence of Verified Credits**: No active promotional credits or billing exemptions were verified on account `********3579`.

**Conclusion**: Deploying InfraPulse to AWS `ap-south-1` will incur a minimum recurring cost of **$24.56 – $45.00/month (~₹2,210 – ₹4,050 INR)**. Because the verified out-of-pocket cost is **greater than ₹0**, an automated **HARD STOP** is enforced. Provisioning is blocked until explicit user authorization and budget approval are provided.

---

## 2. Itemized Cost Breakdown (ap-south-1 Mumbai)

Public catalog rates for `ap-south-1` (730 hours/month arithmetic baseline):

| Cost Category | AWS Resource / SKU | Unit Rate (USD) | Monthly Quantity | Estimated Cost (USD) | Free Tier / Account Credit Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Compute** | Amazon EC2 `t4g.small` (Linux ARM64, 2 vCPU, 2 GB RAM) | $0.0224 / hour | 730 hours | **$16.35** | **Unverified / Billable**: Free tier is 750h `t4g.small` trial (if eligible) or `t2.micro`/`t3.micro`. Account age unverified. |
| **Storage (Root)** | Amazon EBS `gp3` Root Volume | $0.0912 / GB-month | 20 GB | **$1.82** | **Billable**: Account already uses 20 GB of 30 GB allowance (`vol-0a178e73c493ec535`). |
| **Storage (Data)** | Amazon EBS `gp3` Persistent Database Disk | $0.0912 / GB-month | 30 GB | **$2.74** | **100% Billable**: Exceeds remaining 10 GB Free Tier buffer. |
| **Public Networking** | In-use Public IPv4 Address | $0.005 / address-hour | 730 hours | **$3.65** | **100% Billable**: Mandatory AWS charge since Feb 2024; no permanent Free Tier exemption. |
| **Database** | Containerized PostgreSQL 16 on EC2 | $0.00 (Self-hosted) | 1 instance | **$0.00** | Uses EC2 compute/storage; avoids $30.66/mo RDS fee. |
| **Snapshots / Backup** | EBS Snapshot Storage (Incremental changed blocks) | $0.05 / GB-month | ~20 GB retained | **$1.00** | First 5 GB free tier, remaining 15 GB billable. |
| **Data Transfer** | Internet Egress (Outbound traffic to clients) | $0.09 / GB (>100GB) | < 100 GB/month | **$0.00** | First 100 GB/month outbound is free across AWS. |
| **DNS & Routing** | Amazon Route 53 Public Hosted Zone | $0.50 / hosted zone | 1 hosted zone | **$0.50** | Billable if using Route 53 (can use Cloudflare free DNS). |
| **TLS Certificate** | Let's Encrypt ACME via Certbot | $0.00 (Open Source) | Automated renewal | **$0.00** | Free SSL/TLS. |
| **Monitoring / Logs** | Colocated Prometheus + Loki (Local storage) | $0.00 (Self-hosted) | Local disk logs | **$0.00** | Avoids $0.50/GB CloudWatch ingestion fees. |
| **Total Baseline** | **Option A: Minimal EC2 Single Host** | — | — | **$26.06 / month** | **~₹2,345 INR / month** (at ₹90/$1 USD) |
| **Buffer / Overage** | Disk growth, I/O burst, snapshot retention | Variable | — | **$5.00 – $15.00** | **~₹450 – ₹1,350 INR / month** |
| **Total Planning Range**| **Option A (All inclusive)** | — | — | **$31.06 – $41.06 / mo** | **~₹2,795 – ₹3,695 INR / month** |

---

## 3. FinOps Category Classification

To maintain absolute financial transparency, all figures are categorized by verification certainty:

1. **Verified Actual AWS Account State**:
   - Region: `ap-south-1` active.
   - Account ARN: `arn:aws:iam::********3579:root`.
   - Existing resources: 1 active RDS (`reachify-postgres`), 1 stopped EC2, 1 20GB EBS volume, 1 Elastic IP.
2. **Verified Public AWS Catalog Rates**:
   - EC2 `t4g.small`: $0.0224/hr.
   - EBS `gp3`: $0.0912/GB-month.
   - Public IPv4: $0.005/hr ($3.65/mo).
   - Snapshot: $0.05/GB-month.
3. **Unverified Assumptions (Risk Factors)**:
   - Account signup date: Unknown (if older than 12 months, standard 12-month Free Tier benefits have expired).
   - Promotional credit balance: Unknown (no billing credits verified via read-only APIs).
   - Exchange rate: Modeled at ₹90 INR per USD (subject to currency fluctuation).
   - Indian GST: 18% tax on cloud services not included in raw USD catalog rates.

---

## 4. Deployment Approval Checklist

Before ANY AWS infrastructure provisioning can proceed, the user must review and explicitly authorize every item below:

```markdown
### [ ] PRE-DEPLOYMENT APPROVAL CONTRACT

1. Target AWS Account: ********3579
2. Target Region: ap-south-1 (Mumbai)
3. Target Infrastructure (Option A):
   - [ ] 1x Amazon EC2 Instance: t4g.small (ARM64) or t3.small (x86_64)
   - [ ] 1x 20 GB gp3 EBS Root Volume
   - [ ] 1x 30 GB gp3 EBS Persistent Data Volume (KMS encrypted)
   - [ ] 1x Elastic IPv4 Public IP Address (Port 80/443 public, 22 restricted)
   - [ ] 1x Security Group: infrapulse-prod-sg
4. Expected Monthly Cost: $31.06 – $41.06 USD (~₹2,795 – ₹3,695 INR + 18% GST)
5. Worst-Case Potential Cost (Uncapped usage/spikes): $65.00 USD (~₹5,850 INR)
6. Out-of-Pocket Budget Authorization:
   - [ ] "I acknowledge that ₹0 deployment is NOT available on this AWS account."
   - [ ] "I explicitly authorize recurring charges of up to $45.00/month on AWS account ********3579."
7. Rollback & Destruction Procedure:
   - [ ] "I acknowledge that terminating EC2 does not delete EBS volumes or release unattached Elastic IPs unless explicitly cleaned up."
```

---

## 5. Hard Stop Enforcement

> [!CAUTION]
> **FINANCIAL HARD STOP ACTIVE**:
> Under the mandatory constraints of Phase 28, the assistant **CANNOT** and **WILL NOT** provision AWS resources without an explicit, unambiguous written authorization from the user accepting the monthly cost estimate.
>
> **Action Taken**: Provisioning halted at Stage 0. No EC2 instances, EBS volumes, security groups, or Elastic IPs have been created.
>
> **Safe Alternative**: InfraPulse is 100% operational in the local/self-hosted staging environment (`Option C`) at verified **₹0 out-of-pocket cost**.

