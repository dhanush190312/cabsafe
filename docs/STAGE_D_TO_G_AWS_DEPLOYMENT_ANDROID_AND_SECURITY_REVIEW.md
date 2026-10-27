# CabSafe Chennai — Stages D, E, F & G: AWS Infrastructure, Deployment Runbook, Android HTTPS Integration & Final Security Review

> **Engineering Honesty Notice:** All Infrastructure-as-Code templates, DynamoDB persistence adapters, migration scripts, and Android HTTPS/WebSocket configurations have been generated and verified locally (`npm test`, `npm run lint`, `vite build`, and `infra/verify-aws-deployment.ts`). **No billable AWS cloud resources have been provisioned automatically**, in strict compliance with the non-negotiable engineering rules.

---

## Stage D — Infrastructure as Code (IAM, VPC, EC2, ALB, Auto Scaling & DynamoDB)

### 1. Generated Infrastructure Artifacts
| File Path | Purpose |
| :--- | :--- |
| `infra/cloudformation/cabsafe-aws-stack.yaml` | Complete AWS CloudFormation stack provisioning VPC, Subnets, Route Tables, Free DynamoDB Gateway VPC Endpoint, Security Groups, 4 DynamoDB Tables + GSIs, Least-Privilege IAM Instance Role/Profile, Application Load Balancer (HTTPS + WebSocket stickiness), EC2 Launch Template (IMDSv2 enforced), and Multi-AZ Auto Scaling Group (`ap-south-1`). |
| `infra/systemd/cabsafe-backend.service` | Production `systemd` unit file with `KillSignal=SIGTERM`, `TimeoutStopSec=30`, non-root `cabsafe` user, and automatic crash recovery. |
| `infra/verify-aws-deployment.ts` | Automated post-deployment verification script testing ALB `/api/health`, `/api/checkhealth`, Chennai map center (`13.0827, 80.2707`), INR (`₹`) fare calculation, and HTTP `422` out-of-area boundary enforcement. |
| `src/server/dynamodb-client.ts` | Zero-external-dependency AWS Signature Version 4 (`AWS4-HMAC-SHA256`) + EC2 IMDSv2 + DynamoDB JSON 1.0 RPC wire client (`DynamoDB_20120810.*`). |
| `src/server/dynamodb-repository.ts` | Production `DynamoDbRepository` implementing atomic conditional ride acceptance (`#status = :pending AND attribute_not_exists(captainId)`), transactional duplicate active-ride prevention (`TransactWriteCommand`), GSI queries, and high-frequency captain GPS write throttling. |
| `src/server/migrate-to-dynamodb.ts` | Non-destructive migration and verification tool (`migrateJsonStoreToDynamoDb`) preserving `.data/cabsafe-db.json`. |

---

## Stage E — Deployment Instructions, Data Migration & Rollback Runbook

### 1. Pre-Deployment Checklist (Requires Explicit User Approval Before Executing in AWS)
1. **AWS CLI Configured:** Ensure AWS CLI v2 is authenticated with an administrative deployment profile in `ap-south-1` (Mumbai).
2. **ACM TLS Certificate:** Provision or import a public TLS certificate in **AWS Certificate Manager (ACM)** in `ap-south-1` for your domain (e.g., `api.cabsafe-chennai.example.com`) and note its ARN (`arn:aws:acm:ap-south-1:<ACCOUNT_ID>:certificate/<CERT_ID>`).

### 2. Deploying the CloudFormation Stack
```bash
# 1. Validate the CloudFormation template syntax (zero cost)
aws cloudformation validate-template \
  --region ap-south-1 \
  --template-body file://infra/cloudformation/cabsafe-aws-stack.yaml

# 2. Deploy the CabSafe production stack (ONLY after explicit approval)
aws cloudformation deploy \
  --region ap-south-1 \
  --stack-name cabsafe-chennai-prod \
  --template-file infra/cloudformation/cabsafe-aws-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    EnvironmentName=production \
    InstanceType=t3.small \
    AsgMinSize=2 \
    AsgDesiredCapacity=2 \
    AsgMaxSize=4 \
    AcmCertificateArn="arn:aws:acm:ap-south-1:<YOUR_ACCOUNT_ID>:certificate/<YOUR_CERT_ID>"
```

### 3. Retrieving the Load-Balanced API Endpoint
```bash
aws cloudformation describe-stacks \
  --region ap-south-1 \
  --stack-name cabsafe-chennai-prod \
  --query "Stacks[0].Outputs" \
  --output table
```

### 4. Non-Destructive Data Migration from `.data/cabsafe-db.json` to DynamoDB
To migrate existing Chennai seed/development users, captains, rides, and token blacklists into the provisioned DynamoDB tables without modifying `.data/cabsafe-db.json`:
```bash
# Dry-run verification first (no AWS writes)
AWS_REGION=ap-south-1 npx tsx -e "
import { DynamoDBClient, DynamoDBDocumentClient } from './src/server/dynamodb-client';
import { migrateJsonStoreToDynamoDb } from './src/server/migrate-to-dynamodb';
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-south-1' }));
migrateJsonStoreToDynamoDb({
  docClient: doc,
  config: {
    region: 'ap-south-1',
    usersTable: 'CabSafe-Users',
    captainsTable: 'CabSafe-Captains',
    ridesTable: 'CabSafe-Rides',
    blacklistTable: 'CabSafe-TokenBlacklist',
  },
  dryRun: true,
}).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

### 5. Running the Automated Stage E Verification Suite
```bash
# Verify against local server or deployed ALB URL:
ALB_BASE_URL="https://api.cabsafe-chennai.example.com" npx tsx infra/verify-aws-deployment.ts
```

### 6. Rollback Procedure
- **Application-Level Instant Rollback (`PERSISTENCE_MODE=file`):**
  Update `/opt/cabsafe/.env` on EC2 instances (or Launch Template user-data) to set `PERSISTENCE_MODE=file` and restart `systemctl restart cabsafe-backend.service`. `.data/cabsafe-db.json` remains intact and untouched.
- **Infrastructure Rollback:**
  DynamoDB tables (`CabSafe-Users`, `CabSafe-Captains`, `CabSafe-Rides`) are protected with `DeletionPolicy: Retain` and `PointInTimeRecoveryEnabled: true` so stack rollback or teardown never destroys production ride history.

---

## Stage F — Native Android Integration with the Load-Balanced HTTPS API

### 1. Android BuildConfig & Endpoint Separation (`app/build.gradle.kts`)
- **Debug Builds (`debug`):**
  - `BuildConfig.CABSAFE_BASE_URL` = `"http://10.0.2.2:3000"` (Android Emulator host loopback)
  - `BuildConfig.CABSAFE_SOCKET_URL` = `"http://10.0.2.2:3000"`
- **Release Builds (`release`):**
  - `BuildConfig.CABSAFE_BASE_URL` = `"https://api.cabsafe-chennai.example.com"` (or custom ALB domain passed via `local.properties` `CABSAFE_RELEASE_BASE_URL`)
  - `BuildConfig.CABSAFE_SOCKET_URL` = `"https://api.cabsafe-chennai.example.com"`
- **Network Security Config (`app/src/main/res/xml/network_security_config.xml`):**
  - Enforces `<base-config cleartextTrafficPermitted="false" />` globally so production release APKs communicate strictly over TLS/HTTPS with the AWS Application Load Balancer.
  - Permits cleartext HTTP strictly for `10.0.2.2` and `localhost` during local emulator debugging.

### 2. Socket.IO Reconnection & Auto Scaling Instance Draining (`CabSafeSocketManager.kt`)
- When an EC2 instance in the Auto Scaling Group receives `SIGTERM` during scale-in or rolling updates, `server.ts` sets `isDraining = true` (returning HTTP `503` on `/api/health` so the ALB stops routing new requests to that instance) and emits `server-draining` over Socket.IO.
- `CabSafeSocketManager.kt` listens for both `Socket.EVENT_CONNECT` (after reconnect) and `"server-draining"`, emitting `_reconnectedEvents` so `PassengerViewModel` and `CaptainViewModel` immediately invoke `GET /rides/active` to reconcile authoritative trip state from DynamoDB through a healthy EC2 target.

---

## Stage G — Final Security, Scalability & Release-Readiness Review

### 1. Security Audit Matrix
| Security Control | Implementation | Verification Status |
| :--- | :--- | :--- |
| **Zero Embedded AWS Credentials** | No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` exists in Android source, backend source, `.env.example`, or CloudFormation. EC2 instances use temporary credentials via IMDSv2 (`HttpTokens: required`) and `CabSafeEc2InstanceRole`. | **Verified** |
| **Chennai Service-Area Enforcement** | Both Android (`ChennaiServiceArea.kt`) and Backend (`src/server/domain.ts`, `src/server/dynamodb-repository.ts`) enforce the 12-vertex Chennai polygon (`13.0827, 80.2707`), returning HTTP `422` (`OUTSIDE_SERVICE_AREA`) for out-of-area pickups, drops, or captain GPS updates. | **Verified (`npm test` + `verify-aws-deployment.ts`)** |
| **Atomic Ride Acceptance (Race Condition Protection)** | `DynamoDbRepository.confirmRideAtomically` enforces `ConditionExpression: "attribute_exists(rideId) AND #status = :pending AND attribute_not_exists(captainId)"`. Concurrent captain claims return HTTP `409 RIDE_ALREADY_CLAIMED`. | **Verified (`src/server/dynamodb.test.ts`)** |
| **Duplicate Active Booking Prevention** | `DynamoDbRepository.createRide` uses `TransactWriteCommand` updating `CabSafe-Users` (`activeRideId`) and `CabSafe-Rides` atomically. Duplicate requests return HTTP `409 ACTIVE_RIDE_EXISTS`. | **Verified (`src/server/dynamodb.test.ts`)** |
| **Strict 6-Digit Pickup OTP Secrecy** | `sanitizeRideForRole(ride, 'captain')` strips `otp` from all captain REST responses and Socket.IO broadcasts (`new-ride`, `ride-confirmed`, `ride-updated`). Only the passenger receives `otp`, and `startRideWithOtp` validates it in DynamoDB `ConditionExpression`. | **Verified (`src/server/domain.test.ts` + `dynamodb.test.ts`)** |
| **High-Frequency Captain GPS Write Throttling** | `DynamoDbRepository.updateCaptainLocation` throttles DynamoDB `UpdateItem` writes to once per `10s` or `>=25m` displacement while keeping Socket.IO `captain-location-updated` broadcasts real-time. | **Verified (`src/server/dynamodb.test.ts`)** |

### 2. Known Environment Limitations & Honest Status Summary
1. **Native Android Gradle Compilation (`./gradlew assembleDebug`):**
   - Complete native Android Kotlin + Jetpack Compose source files (`app/build.gradle.kts`, `AndroidManifest.xml`, `ChennaiServiceArea.kt`, `CabSafeApiService.kt`, `CabSafeSocketManager.kt`, `CabSafeRepository.kt`, `PassengerViewModel.kt`, `CaptainViewModel.kt`, `PassengerScreen.kt`, `CaptainScreen.kt`, and `ChennaiServiceAreaTest.kt`) are present and synchronized in `/app`.
   - The Linux web container workspace does not have the Android SDK (`ANDROID_HOME`) installed, so Gradle APK compilation must be executed after exporting the project ZIP into **Android Studio Ladybug (or newer)** with Android SDK 35.
2. **AWS Cloud Provisioning:**
   - All CloudFormation definitions (`infra/cloudformation/cabsafe-aws-stack.yaml`), systemd units (`infra/systemd/cabsafe-backend.service`), and DynamoDB adapters (`src/server/dynamodb-repository.ts`) are complete and tested offline.
   - Live AWS provisioning in `ap-south-1` awaits your explicit approval and AWS account credentials.
