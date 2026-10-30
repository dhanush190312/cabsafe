# CabSafe Chennai — AWS Console CloudFormation Deployment Guide

> **Target AWS Region:** `ap-south-1` (Asia Pacific — Mumbai)  
> **Deployment Type:** AWS CloudFormation (Infrastructure as Code)  
> **Template File:** [`infra/cloudformation/cabsafe-aws-stack.yaml`](../infra/cloudformation/cabsafe-aws-stack.yaml)

---

## 1. Prerequisites

1. **Active AWS Account:** With administrative permissions for CloudFormation, EC2, VPC, IAM, and DynamoDB.
2. **Local Template File Location:**
   ```text
   C:\cab project\cabsafe-chennai-main\cabsafe-chennai-main\infra\cloudformation\cabsafe-aws-stack.yaml
   ```
3. **GitHub Repository:** Ensure your repository [`https://github.com/dhanush190312/cabsafe.git`](https://github.com/dhanush190312/cabsafe.git) is **Public** (or accessible to EC2) and has your latest code pushed so instances can clone and build the backend upon boot.

---

## 2. Step-by-Step Console Walkthrough

### Step 1: Set AWS Region to Mumbai
1. Log in to the [AWS Management Console](https://console.aws.amazon.com/).
2. Look at the **top-right navigation bar** (next to your username).
3. Ensure the active region is selected as **Asia Pacific (Mumbai) `ap-south-1`**.

---

### Step 2: Open CloudFormation & Initiate Stack
1. In the top search bar, type `CloudFormation` and click on **CloudFormation**.
2. Click the orange **Create stack** button and select **With new resources (standard)**.

---

### Step 3: Upload the Stack Template
1. Under **Prerequisite - Prepare template**, keep **Template is ready** selected.
2. Under **Specify template**, select **Upload a template file**.
3. Click the **Choose file** button.
4. Browse to and select:
   ```text
   C:\cab project\cabsafe-chennai-main\cabsafe-chennai-main\infra\cloudformation\cabsafe-aws-stack.yaml
   ```
5. Click **Next** at the bottom right.

---

### Step 4: Configure Stack Parameters
1. **Stack name:** Enter `cabsafe-chennai-prod`
2. **Parameters Table:**

| Parameter | Recommended Value | Description |
| :--- | :--- | :--- |
| **`EnvironmentName`** | `production` | Environment prefix for tags and resource names |
| **`InstanceType`** | `t3.small` | EC2 instance sizing (`t3.micro` may be used for lowest testing cost) |
| **`AsgMinSize`** | `2` | Minimum instances across 2 Availability Zones |
| **`AsgDesiredCapacity`** | `2` | Initial active instance count |
| **`AsgMaxSize`** | `4` | Maximum instances during traffic peaks |
| **`AppGitRepoUrl`** | `https://github.com/dhanush190312/cabsafe.git` | Public Git repository cloned by EC2 user-data |
| **`GitBranch`** | `main` | Git branch or tag to deploy on EC2 instances |
| **`JwtSecret`** | *(Keep default or enter custom secret)* | Secret key used to sign User and Captain JWT tokens |
| **`AcmCertificateArn`** | *(Leave blank)* | Leave empty for HTTP (Port 80) testing. Enter ACM ARN only if using HTTPS with a custom domain |
| **`VpcCidr`** | `10.20.0.0/16` | Default VPC CIDR block |
| **Subnet CIDRs** | *(Keep defaults)* | Pre-configured non-overlapping subnets across AZ-a and AZ-b |

3. Click **Next**.

---

### Step 5: Configure Stack Options
1. On the **Configure stack options** page, leave all default settings (Tags, Permissions, Rollback options).
2. Click **Next** at the bottom.

---

### Step 6: Acknowledge IAM Capabilities & Submit
1. Scroll down to the bottom of the **Review cabsafe-chennai-prod** screen.
2. In the blue **Capabilities** section, check the acknowledgment box:
   > **[X] I acknowledge that AWS CloudFormation might create IAM resources with custom names.**
   
   *(This grants CloudFormation permission to create the least-privilege `CabSafe-EC2-InstanceRole-production` role for DynamoDB access).*
3. Click the orange **Submit** button.

---

### Step 7: Monitor Stack Creation
1. CloudFormation will display the **Events** tab. You will see resources provisioned in order:
   - VPC, Internet Gateway, Subnets, and DynamoDB Gateway Endpoint
   - 4 DynamoDB Tables (`CabSafe-Users`, `CabSafe-Captains`, `CabSafe-Rides`, `CabSafe-TokenBlacklist`)
   - Security Groups and Least-Privilege IAM Instance Role
   - Application Load Balancer (ALB) and Target Group with sticky sessions
   - Launch Template and Multi-AZ Auto Scaling Group
2. Wait 3–5 minutes until the status at the top turns green: **`CREATE_COMPLETE`**.

---

### Step 8: Retrieve the Live API & Load Balancer URL
1. Go to the **Outputs** tab of your stack.
2. Note the values:
   - **`AlbDnsName`**: The public DNS name of your load balancer (e.g. `CabSafe-ALB-production-123456789.ap-south-1.elb.amazonaws.com`).
   - **`ApiBaseUrl`**: The base URL to use for testing and mobile app configuration.

---

## 3. Post-Deployment Verification

### 1. Test Health Check in Browser / Terminal
Run the following curl command in PowerShell or open the URL in your browser:
```powershell
curl http://<YOUR_ALB_DNS_NAME>/api/health
```

Expected Response:
```json
{
  "status": "healthy",
  "persistenceMode": "dynamodb",
  "dynamodb": {
    "users": true,
    "captains": true,
    "rides": true,
    "blacklist": true
  },
  "operatingArea": "Chennai, Tamil Nadu, India",
  "uptimeSeconds": 45,
  "timestamp": "2026-10-27T14:15:00.000Z"
}
```

### 2. View Bootstrap Logs (Optional)
If instances are starting up or you wish to inspect the boot sequence, connect via AWS Systems Manager (SSM Session Manager) and inspect:
```bash
sudo cat /var/log/cabsafe-bootstrap.log
sudo systemctl status cabsafe-backend.service
```

### 3. Run the Automated Verification Script
From your project root folder, execute:
```powershell
$env:ALB_BASE_URL="http://<YOUR_ALB_DNS_NAME>"
npx tsx infra/verify-aws-deployment.ts
```

This automated script verifies:
- ALB HTTP `/api/health` connectivity
- DynamoDB persistence mode active
- Chennai service boundary enforcement (`13.0827, 80.2707`)
- Dynamic fare calculation in INR (`₹`)
- Out-of-area 422 HTTP rejection logic

---

## 4. Rollback or Teardown

If you ever wish to delete the provisioned stack:
1. In CloudFormation Console, select `cabsafe-chennai-prod`.
2. Click **Delete** > **Delete stack**.
3. Note: The DynamoDB tables have `DeletionPolicy: Retain` configured to ensure production ride records and user data are never lost accidentally during stack deletion.
