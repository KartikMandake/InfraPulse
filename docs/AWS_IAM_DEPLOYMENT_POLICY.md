# InfraPulse — AWS IAM Least-Privilege Deployment Policy

**Platform**: InfraPulse v2.4.0  
**Phase**: Phase 28 — Controlled Cloud Deployment  
**Scope**: AWS Region `ap-south-1` (Mumbai)  
**Security Standard**: CIS AWS Foundations Benchmark & AWS Least-Privilege Architecture  

---

## 1. Security Architecture & IAM Principles

InfraPulse strictly rejects wildcard (`*`) administrative permissions, hardcoded API credentials, and long-lived access keys. The IAM architecture separates privileges into two distinct identities:

1. **Deployment Identity (`InfraPulseDeploymentRole`)**:
   - Used by CI/CD or authorized infrastructure automation to provision the EC2 host, security group, and attach the persistent EBS volume in `ap-south-1`.
   - Strictly scoped to tagged resources with `Project: InfraPulse`.
2. **Workload Runtime Identity (`InfraPulseWorkloadRole`)**:
   - Attached directly to the EC2 instance via an **IAM Instance Profile**.
   - Grants the backend read-only discovery permissions across EC2 and RDS in `ap-south-1`.
   - Eliminates the need to store AWS access keys or secret keys in `.env`, Docker containers, or PostgreSQL.

---

## 2. Workload Runtime Policy: `InfraPulseWorkloadPolicy`

Attach this policy to the EC2 Instance Profile (`InfraPulseWorkloadProfile`):

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
        "ec2:DescribeRegions",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets"
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
        "rds:DescribeDBInstances",
        "rds:DescribeDBSubnetGroups"
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

## 3. Provisioning Policy: `InfraPulseDeploymentPolicy`

Used by deployment automation to create and configure the single host in `ap-south-1`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2InstanceManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus"
      ],
      "Resource": [
        "arn:aws:ec2:ap-south-1:*:instance/*",
        "arn:aws:ec2:ap-south-1:*:subnet/*",
        "arn:aws:ec2:ap-south-1:*:security-group/*",
        "arn:aws:ec2:ap-south-1:*:volume/*",
        "arn:aws:ec2:ap-south-1:*:network-interface/*",
        "arn:aws:ec2:ap-south-1:*:image/*",
        "arn:aws:ec2:ap-south-1:*:key-pair/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "EBSVolumeManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateVolume",
        "ec2:AttachVolume",
        "ec2:DetachVolume",
        "ec2:DescribeVolumes",
        "ec2:CreateSnapshot"
      ],
      "Resource": [
        "arn:aws:ec2:ap-south-1:*:volume/*",
        "arn:aws:ec2:ap-south-1:*:snapshot/*",
        "arn:aws:ec2:ap-south-1:*:instance/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "SecurityGroupManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "arn:aws:ec2:ap-south-1:*:security-group/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "ElasticIPManagement",
      "Effect": "Allow",
      "Action": [
        "ec2:AllocateAddress",
        "ec2:AssociateAddress",
        "ec2:DisassociateAddress",
        "ec2:ReleaseAddress",
        "ec2:DescribeAddresses"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "ResourceTagging",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateTags"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Project": "InfraPulse",
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "PassRoleToEC2",
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::*:role/InfraPulseWorkloadRole"
    }
  ]
}
```

---

## 4. Prohibited Permissions & Guardrails

The following permissions are **explicitly prohibited** and will be rejected by policy evaluation:
- `iam:CreateUser`, `iam:DeleteUser`, `iam:CreateAccessKey` (No local IAM credentials).
- `iam:Attach*Policy`, `iam:Put*Policy` (No privilege escalation).
- `*:*` (Wildcard root or administrator permissions).
- `aws-portal:*`, `ce:*` (Paid billing/Cost Explorer APIs).
- `s3:DeleteBucket`, `rds:DeleteDBInstance` (Accidental deletion of existing data).
- Actions in any region other than `ap-south-1`.

---

## 5. Trust Relationships (AssumeRole)

### For Workload Instance Profile:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

## 6. Credential Safety Rules

1. **Zero Static Credentials**: Never store `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in git repositories, `.env` files, or Docker images.
2. **Metadata Service Security (IMDSv2)**: EC2 instances must enforce `HttpTokens=required` (IMDSv2) with hop limit = 1 to prevent containerized workloads from exfiltrating host credentials.
3. **Audit Logging**: Privileged IAM actions are logged in AWS CloudTrail and recorded in InfraPulse's immutable `audit_logs` table.

