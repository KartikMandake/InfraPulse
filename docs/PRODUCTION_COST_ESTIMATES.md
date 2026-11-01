# Production cost estimates

Prepared **2026-11-01**, region **ap-south-1**, 730 hours/month. **These are planning estimates, not AWS billing, a quotation, or a spending limit. ₹0 deployment is NOT VERIFIED.** No Billing/Cost Explorer APIs or account-credit screens were queried, and no resources were created. Existing discovery cost fields are estimates and do not establish invoiced spend or Free Tier eligibility.

## Public rate evidence

Anonymous public AWS catalog downloads were filtered locally; selected rows and retrieval timestamps are in [public-prices.json](../reports/phase24/public-prices.json). No AWS credentials were used for these downloads.

| Item | Public USD rate used | Monthly arithmetic / source |
|---|---:|---|
| Linux shared EC2 t4g.medium, Mumbai | $0.0224/hour | $16.35 at 730 h; [regional EC2 catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-south-1/index.csv) |
| Linux shared EC2 t4g.large, Mumbai | $0.0448/hour | $32.70; same catalog; no Savings Plans/Spot commitment assumed |
| EC2 gp3 capacity, Mumbai | $0.0912/GB-month | 50 GB = $4.56; extra IOPS/throughput excluded; same catalog |
| Public IPv4 | $0.005/address-hour | One address = $3.65; [VPC pricing](https://aws.amazon.com/vpc/pricing/) |
| Linux x86 Fargate CPU / memory, Mumbai | $0.04256/vCPU-hour + $0.004655/GB-hour | API 0.5 vCPU/1 GB + worker 0.25 vCPU/0.5 GB = **$28.40**; [regional ECS catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-south-1/index.json). Additional ephemeral storage has a separate rate; no paid extra capacity assumed. |
| RDS PostgreSQL db.t4g.small, Single-AZ, Mumbai | $0.042/hour | $30.66 compute only; micro $15.33 and medium $61.32 are alternatives, not capacity recommendations; [regional RDS catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-south-1/index.json). Use InstanceUsage rows, not unused-capacity reservation rows. |
| Application Load Balancer, Mumbai | $0.0239/hour + $0.008/used-LCU-hour | $17.45 base + $5.84 at average 1 LCU; IPv4 billed separately; [regional ELB catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ap-south-1/index.json) |
| Lightsail Linux IPv4 4 GB / 8 GB bundles | $24 / $44 per month | Disk/transfer included as specified; [official bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) |
| Lightsail snapshot storage | $0.05/GB-month | 50 GB stored = $2.50; actual retained changed-block storage differs; [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/) |

Rates may change after retrieval. Availability, architecture compatibility and actual account pricing remain unverified. The 4 GB Lightsail allowance in Mumbai is **2 TB**, rather than the generic 4 TB listing; the 8 GB allowance is 2.5 TB. Stopped Lightsail instances still incur bundle charges; detached static IPv4 has separate charging rules. [Lightsail FAQ](https://aws.amazon.com/lightsail/faq/).

## Complete architecture scenarios

| Option | Core recurring arithmetic | Additional modeled allowances | Planning total |
|---|---|---|---|
| A: EC2 4 GiB single host | $16.35 compute + $4.56 / 50 GB total gp3 + $3.65 IPv4 = **$24.56** | Independent backups/snapshots $1–5; DNS/domain amortization $1–3; logs/transfer/requests allowance $3–12 | **$30–45/month** (~₹2,700–4,050 at illustrative ₹90/USD) |
| A: EC2 8 GiB single host | $32.70 + $4.56 + $3.65 = **$40.91** | Backup/DNS/log/transfer allowance $5–29; more telemetry disk adds charges | **$46–70/month** (~₹4,140–6,300) |
| B: managed, one API + one worker, Single-AZ DB | $28.40 Fargate + $30.66 DB + $17.45 ALB + $5.84 / one average LCU + $7.30 / two ALB IPv4 = **$89.65**, excluding DB storage | RDS storage allowance $3–6; one NAT/outbound path allowance $40–70; DNS, S3/CloudFront, ECR, logs, backups and requests $17–54 | **$150–220/month** (~₹13,500–19,800); usage spikes can exceed it |
| B: proposed HA managed design | More API replicas, separately quoted Multi-AZ RDS, second egress path/AZ, backup and cross-AZ transfer | No fixed Multi-AZ rate was verified; model and quote every selected SKU before approval | **$250–400+/month** (~₹22,500–36,000+) |
| C: Lightsail 4 GiB | $24 bundle + $2.50 / 50 GB retained snapshots = **$26.50** | Off-host logical backups, DNS/domain, logs/requests allowance $2.50–13.50 | **$29–40/month** (~₹2,610–3,600) |
| C: Lightsail 8 GiB | $44 bundle + $4 / 80 GB snapshots = **$48** | Off-host backup/DNS/log allowances $2–17 | **$50–65/month** (~₹4,500–5,850) |

The INR conversion is an **illustrative assumption of ₹90/USD**, not a verified exchange rate. Taxes, card conversion, support plans and labor are excluded. Backup, DNS, NAT, managed-storage, frontend-delivery and logging allowances above are scenario assumptions, **not verified regional unit-rate quotes**. They must be replaced with a saved itemized AWS Calculator/account estimate before purchase. The lower bounds are rounded planning budgets and do not promise a maximum bill.

## Charges that must not be omitted

- EBS, retained snapshots, unattached public IPs, RDS storage/backups and domain renewals can continue while application compute is stopped. Container shutdown is not a cost-control strategy.
- Burstable EC2/RDS CPU-credit surplus, EBS provisioned IOPS/throughput, CloudWatch ingestion/retention/custom metrics/queries, object requests, ECR storage/scans, DNS queries, Internet and cross-AZ egress, backup restore retrieval and key/secret management can add cost.
- Private Fargate tasks need a deliberate outbound design. NAT has gateway-hours, processing and associated IPv4/transfer costs. Multiple interface endpoints have per-AZ/hour and processing costs and do not provide general external SMTP/Slack/AI access. Do not describe private tasks as having free Internet access. [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [VPC pricing](https://aws.amazon.com/vpc/pricing/).
- Paid TLS/managed certificate export, WAF, managed log/metric pipelines, external notification services, AI usage, multi-region copies and production support are optional additions with **unquoted** costs. The single-host design assumes a separately validated certificate approach without a purchased certificate; DNS/domain costs still apply.
- Retention/WAL growth and restore targets need additional storage. Two databases running during recovery can incur overlap charges. A budget alarm is an alert, not a hard spending cap; its configuration and any notification charges also need review.

## ₹0 gate

AWS offers differ by account signup date, plan, service and remaining credits. The current [Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/) describes eligibility and credit expiry; it does not verify this account. No promotional balance or legacy allowance has been applied to these estimates.

Before a future deployment, an authorized owner must verify account plan/age, eligible services/regions, remaining credits and expiration, every billable component, tax/currency effects, existing shared-account usage and the cost after credits expire. Record a dated calculator estimate and cost-monitoring/removal plan. **Until that evidence proves the complete target stays within the authorized budget, do not deploy.** This preparation work itself provisioned no paid resources and does not establish the existing account's total bill.
