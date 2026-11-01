# InfraPulse AWS Read-Only IAM Least-Privilege Policy

This document defines the recommended, strictly read-only IAM policy for connecting InfraPulse to an existing AWS account in region `ap-south-1` (Mumbai).

---

## Least-Privilege Policy Definition

Create an IAM Policy named **`InfraPulseReadOnlyDiscoveryPolicy`** in the AWS Console or via AWS CLI:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InfraPulseCallerIdentity",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "InfraPulseEc2ReadOnlyDiscovery",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeVolumes",
        "ec2:DescribeAddresses",
        "ec2:DescribeRegions"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "InfraPulseRdsReadOnlyDiscovery",
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    }
  ]
}
```

---

## Supported AWS APIs

| AWS Service | API Action | Usage in InfraPulse | Mutation? |
| :--- | :--- | :--- | :--- |
| **AWS STS** | `sts:GetCallerIdentity` | Validates credential provider chain & extracts masked account ID/ARN | **No (Read-Only)** |
| **Amazon EC2** | `ec2:DescribeInstances` | Discovers virtual servers, instance types, state, and attached disks | **No (Read-Only)** |
| **Amazon EC2** | `ec2:DescribeVolumes` | Discovers persistent EBS gp3/gp2 volumes, volume sizes, and attachment state | **No (Read-Only)** |
| **Amazon EC2** | `ec2:DescribeAddresses` | Discovers public IPv4 Elastic IP addresses and association states | **No (Read-Only)** |
| **Amazon EC2** | `ec2:DescribeRegions` | Verifies allowed region boundaries (`ap-south-1`) | **No (Read-Only)** |
| **Amazon RDS** | `rds:DescribeDBInstances` | Discovers relational database instances, engines, instance classes, and storage | **No (Read-Only)** |

---

## Prohibited Mutating Calls

Under this policy and within InfraPulse's `AwsReadOnlyProvider`, the following operations are **strictly prohibited and never executed**:
- `ec2:RunInstances`, `ec2:StartInstances`, `ec2:StopInstances`, `ec2:RebootInstances`, `ec2:TerminateInstances`
- `ec2:CreateVolume`, `ec2:DeleteVolume`, `ec2:AttachVolume`, `ec2:DetachVolume`, `ec2:ModifyVolume`
- `ec2:AllocateAddress`, `ec2:ReleaseAddress`, `ec2:AssociateAddress`, `ec2:DisassociateAddress`
- `rds:CreateDBInstance`, `rds:DeleteDBInstance`, `rds:ModifyDBInstance`, `rds:RebootDBInstance`
- `iam:*` (No IAM modifications or policy creations)
- `s3:*` (No bucket creations, uploads, or deletions)
- `ce:*` (Paid Cost Explorer APIs are disabled)

---

## Credential Security Model

1. **Zero Credential Storage in PostgreSQL**: Access keys, secret keys, or temporary session tokens are **never stored** in the InfraPulse database or configuration tables.
2. **Standard AWS Provider Chain**: InfraPulse relies on the standard `@aws-sdk/credential-providers` resolution chain:
   - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)
   - AWS CLI profiles (`~/.aws/credentials`, `~/.aws/config`) via `AWS_PROFILE`
   - Future AWS deployment: IAM Instance Profiles / ECS Task Roles / EKS Pod Identities
3. **Data Redaction**: Sensitive 12-digit AWS account numbers are masked in logs and API responses (e.g., `********3579`).
4. **Rate Limiting & Admin Gate**: AWS discovery synchronization is gated behind the `admin` role and enforces a minimum 15-second cooldown to protect against API throttling.

