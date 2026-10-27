# CabSafe Chennai — Stage B: AWS Cloud Architecture, DynamoDB Data Model & Migration Plan

## 1. Architecture Overview & Design Principles

This document defines the production AWS architecture and Amazon DynamoDB data model for **CabSafe Chennai**. It preserves all existing Passenger and Captain workflows, Chennai service-area enforcement (`13.0827, 80.2707`), 6-digit pickup OTP verification, and Indian Rupee (`₹`) fare calculations while enabling horizontal scaling across multiple Amazon EC2 instances behind an Application Load Balancer (ALB).

> **Deployment Status Notice:** This document and the accompanying repository/infrastructure files define the cloud architecture and persistence layer. No billable AWS resources have been provisioned automatically.

---

## 2. Explicit Network-Flow Diagram (Amazon VPC — Multi-AZ)

Target AWS Region: `ap-south-1` (Mumbai, India) — selected for lowest round-trip network latency to Chennai, Tamil Nadu.

```
                         [ Native Android App / Web Client ]
                                         │
                                         │ HTTPS (TCP 443) / WSS (Socket.IO)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ AWS Cloud (Region: ap-south-1)                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ VPC: CabSafe-VPC (CIDR: 10.20.0.0/16)                                           │ │
│ │                                                                                 │ │
│ │  ┌───────────────────────────────────┐   ┌───────────────────────────────────┐  │ │
│ │  │ Availability Zone: ap-south-1a    │   │ Availability Zone: ap-south-1b    │  │ │
│ │  │                                   │   │                                   │  │ │
│ │  │ ┌───────────────────────────────┐ │   │ ┌───────────────────────────────┐ │  │ │
│ │  │ │ Public Subnet A               │ │   │ │ Public Subnet B               │ │  │ │
│ │  │ │ CIDR: 10.20.1.0/24            │ │   │ │ CIDR: 10.20.2.0/24            │ │  │ │
│ │  │ │  ┌─────────────────────────┐  │ │   │ │  ┌─────────────────────────┐  │ │  │ │
│ │  │ │  │ Application Load        ├──┼─┼───┼─┼──┤ Balancer (ALB)          │  │ │  │ │
│ │  │ │  │ SG: CabSafe-ALB-SG      │  │ │   │ │  │ Sticky Cookie: AWSALB   │  │ │  │ │
│ │  │ │  └────────────┬────────────┘  │ │   │ │  └────────────┬────────────┘  │ │  │ │
│ │  │ └───────────────┼───────────────┘ │   │ └───────────────┼───────────────┘ │  │ │
│ │  │                 │ HTTP (TCP 3000) │   │                 │ HTTP (TCP 3000) │  │ │
│ │  │                 ▼                 │   │                 ▼                 │  │ │
│ │  │ ┌───────────────────────────────┐ │   │ ┌───────────────────────────────┐ │  │ │
│ │  │ │ Private App Subnet A          │ │   │ │ Private App Subnet B          │ │  │ │
│ │  │ │ CIDR: 10.20.11.0/24           │ │   │ │ CIDR: 10.20.12.0/24           │ │  │ │
│ │  │ │  ┌─────────────────────────┐  │ │   │ │  ┌─────────────────────────┐  │ │  │ │
│ │  │ │  │ EC2 Instance (ASG)      │  │ │   │ │  │ EC2 Instance (ASG)      │  │ │  │ │
│ │  │ │  │ Node.js + Socket.IO     │  │ │   │ │  │ Node.js + Socket.IO     │  │ │  │ │
│ │  │ │  │ SG: CabSafe-EC2-SG      │  │ │   │ │  │ SG: CabSafe-EC2-SG      │  │ │  │ │
│ │  │ │  │ IAM: CabSafe-EC2-Role   │  │ │   │ │  │ IAM: CabSafe-EC2-Role   │  │ │  │ │
│ │  │ │  └────────────┬────────────┘  │ │   │ │  └────────────┬────────────┘  │ │  │ │
│ │  │ └───────────────┼───────────────┘ │   │ └───────────────┼───────────────┘ │  │ │
│ │  └─────────────────┼─────────────────┘   └─────────────────┼─────────────────┘  │ │
│ │                    │                                       │                    │ │
│ │                    └───────────────────┬───────────────────┘                    │ │
│ │                                        │ HTTPS (TCP 443 via Private Route Table)│ │
│ │                                        ▼                                        │ │
│ │                   ┌─────────────────────────────────────────┐                   │ │
│ │                   │ VPC Gateway Endpoint for DynamoDB       │                   │ │
│ │                   │ (com.amazonaws.ap-south-1.dynamodb)     │                   │ │
│ │                   └────────────────────┬────────────────────┘                   │ │
│ └────────────────────────────────────────┼────────────────────────────────────────┘ │
│                                          ▼                                          │
│                   ┌─────────────────────────────────────────┐                       │
│                   │ Amazon DynamoDB Tables                  │                       │
│                   │ - CabSafe-Users                         │                       │
│                   │ - CabSafe-Captains                      │                       │
│                   │ - CabSafe-Rides                         │                       │
│                   │ - CabSafe-TokenBlacklist                │                       │
│                   └─────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Security Group Ingress and Egress Rules

No database ports, SSH ports, or internal Node.js ports (`3000`) are exposed to the public internet.

| Security Group | Rule Type | Protocol | Port Range | Source / Destination | Justification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CabSafe-ALB-SG** | Ingress | TCP | `443` | `0.0.0.0/0`, `::/0` | Public HTTPS REST API and WSS Socket.IO connections from Android/Web clients. |
| **CabSafe-ALB-SG** | Ingress | TCP | `80` | `0.0.0.0/0`, `::/0` | HTTP listener solely for permanent `301` redirect to HTTPS `443`. |
| **CabSafe-ALB-SG** | Egress | TCP | `3000` | `CabSafe-EC2-SG` | Forward load-balanced requests and WebSocket frames to backend EC2 instances. |
| **CabSafe-EC2-SG** | Ingress | TCP | `3000` | `CabSafe-ALB-SG` | Accept HTTP/WebSocket traffic **exclusively** from the Application Load Balancer. |
| **CabSafe-EC2-SG** | Egress | TCP | `443` | DynamoDB Prefix List (`pl-xxxxxxx`) | Private HTTPS access to Amazon DynamoDB via the VPC Gateway Endpoint. |
| **CabSafe-EC2-SG** | Egress | TCP | `443` | `0.0.0.0/0` | Outbound HTTPS to AWS Systems Manager (SSM Session Manager), Photon/OSM geocoding, and OSRM routing. |
| **CabSafe-Redis-SG** *(Optional)* | Ingress | TCP | `6379` | `CabSafe-EC2-SG` | Only used if ElastiCache Redis is enabled for cross-instance Socket.IO pub/sub. |

---

## 4. AWS IAM Least-Privilege Design

The backend EC2 instances authenticate to DynamoDB using temporary, automatically rotated credentials provided by an **IAM Instance Profile** (`CabSafe-EC2-InstanceProfile`).

* **Zero hardcoded keys:** No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is stored in Android code, React code, `.env` files, or Git history.
* **Narrowly Scoped IAM Policy (`CabSafe-DynamoDB-Policy`):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CabSafeDynamoDBTableOperations",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:TransactWriteItems",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-Users",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-Users/index/*",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-Captains",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-Captains/index/*",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-Rides",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-Rides/index/*",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/CabSafe-TokenBlacklist"
      ]
    },
    {
      "Sid": "CabSafeSSMParameterRead",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/cabsafe/*"
    }
  ]
}
```

> Notice that `dynamodb:Scan`, `dynamodb:DeleteTable`, and wildcard `*` resources are intentionally excluded from runtime permissions.

---

## 5. Amazon DynamoDB Data Model & Access Patterns

### 5.1 Table Definitions

#### Table 1: `CabSafe-Users`
* **Partition Key (`PK`):** `userId` (`String`) — e.g., `"671a00000000000000000001"`
* **Global Secondary Index (`EmailIndex`):**
  * Partition Key: `email` (`String`, normalized lowercase)
  * Projection: `ALL`
* **Key Attributes:**
  * `userId`, `email`, `fullname: { firstname, lastname }`, `phone`, `password` (bcrypt hash), `rating`, `socketId`, `activeRideId` (`String | null`), `createdAt`.

#### Table 2: `CabSafe-Captains`
* **Partition Key (`PK`):** `captainId` (`String`) — e.g., `"671b00000000000000000101"`
* **Global Secondary Index 1 (`EmailIndex`):**
  * Partition Key: `email` (`String`, normalized lowercase)
  * Projection: `ALL`
* **Global Secondary Index 2 (`StatusVehicleIndex`):**
  * Partition Key: `status` (`String`: `'active' | 'inactive'`)
  * Sort Key: `vehicleType` (`String`: `'car' | 'cng' | 'motorcycle'`)
  * Projection: `ALL`
* **Key Attributes:**
  * `captainId`, `email`, `status`, `vehicleType`, `fullname`, `phone`, `password`, `vehicle: { color, plate, capacity, vehicleType, model }`, `location: { type: 'Point', coordinates: [lon, lat], updatedAt }`, `metrics: { rating, completedRides, assignedRides, totalEarnings, distanceKm, hoursOnline }`, `createdAt`.

#### Table 3: `CabSafe-Rides`
* **Partition Key (`PK`):** `rideId` (`String`) — e.g., `"671c00000000000000000201"`
* **Global Secondary Index 1 (`UserRidesIndex`):**
  * Partition Key: `userId` (`String`)
  * Sort Key: `createdAt` (`String`, ISO-8601 timestamp)
  * Projection: `ALL`
* **Global Secondary Index 2 (`CaptainRidesIndex`):**
  * Partition Key: `captainId` (`String` — sparse index; attribute omitted until ride is accepted)
  * Sort Key: `createdAt` (`String`, ISO-8601 timestamp)
  * Projection: `ALL`
* **Global Secondary Index 3 (`StatusCreatedIndex`):**
  * Partition Key: `status` (`String`: `'pending' | 'accepted' | 'ongoing' | 'completed' | 'cancelled'`)
  * Sort Key: `createdAt` (`String`, ISO-8601 timestamp)
  * Projection: `ALL`

#### Table 4: `CabSafe-TokenBlacklist`
* **Partition Key (`PK`):** `tokenHash` (`String`, SHA-256 hex digest of revoked JWT)
* **TTL Attribute:** `expiresAt` (`Number`, Unix epoch seconds)

---

### 5.2 Access Pattern Mapping Table

| Application Operation | Table / Index | DynamoDB Operation | Key Condition / Filter |
| :--- | :--- | :--- | :--- |
| Register passenger | `CabSafe-Users` | `Query` (`EmailIndex`) + `PutItem` | `attribute_not_exists(userId)` |
| Login passenger | `CabSafe-Users` / `EmailIndex` | `Query` | `email = :email` |
| Get passenger profile | `CabSafe-Users` | `GetItem` | `userId = :userId` |
| Register / Login captain | `CabSafe-Captains` / `EmailIndex`| `Query` + `PutItem` / `UpdateItem` | `email = :email` |
| Find online captains for ranking | `CabSafe-Captains` / `StatusVehicleIndex` | `Query` | `status = 'active'` (and optional `vehicleType = :vt`) |
| Create ride & block duplicate | `CabSafe-Rides` + `CabSafe-Users` | `TransactWriteItems` | User: `attribute_not_exists(activeRideId) OR activeRideId = :null` |
| Atomic captain ride acceptance | `CabSafe-Rides` | `UpdateItem` | `#status = :pending AND attribute_not_exists(captainId)` |
| Verify OTP & start trip | `CabSafe-Rides` | `UpdateItem` | `#status = :accepted AND captainId = :cid AND otp = :otp` |
| Complete trip & update earnings | `CabSafe-Rides`, `Users`, `Captains` | `TransactWriteItems` | Ride `#status = :ongoing AND captainId = :cid` |
| Restore active ride on reconnect | `UserRidesIndex` / `CaptainRidesIndex` | `Query` (`ScanIndexForward: false`) | Filter `status IN ('pending', 'accepted', 'ongoing')` |
| List pending rides for captain | `CabSafe-Rides` / `StatusCreatedIndex` | `Query` | `status = 'pending'` |
| Check JWT revocation | `CabSafe-TokenBlacklist` | `GetItem` | `tokenHash = :sha256(token)` |

---

## 6. Multi-Instance Socket.IO Correctness

1. **ALB Sticky Sessions:**
   Socket.IO negotiates transport via HTTP long-polling before upgrading to WebSocket (`GET /socket.io/?EIO=4&transport=websocket`). The ALB Target Group enables duration-based stickiness (`AWSALB` cookie, 86,400s) so multi-request handshakes always hit the same EC2 instance.
2. **Deterministic Actor Rooms:**
   On `join`, the backend verifies the JWT and joins the socket to `user:${userId}` or `captain:${captainId}`. We do not rely on process-local `socketId` strings for routing across instances.
3. **Cross-Instance Event Delivery:**
   * **Single-Node / Student Cost-Zero Mode:** When ASG runs `DesiredCapacity = 1` (with Auto Scaling replacement on health failure and scale-out to `MaxSize = 2` on CPU spikes), clients reconnect and immediately call `GET /rides/active` to recover durable ride state from DynamoDB.
   * **Multi-Node Pub/Sub Mode:** When `REDIS_URL` is configured, `server.ts` attaches a Redis Pub/Sub mechanism so `io.to('user:<id>').emit(...)` and `io.to('captain:<id>').emit(...)` propagate across all EC2 instances.
4. **High-Frequency GPS Throttling:**
   Live captain coordinates are broadcast immediately to the passenger's room (`captain-location-updated`), while DynamoDB `UpdateItem` calls on `CabSafe-Captains` are throttled to persist only when the captain has moved $\ge 25\text{m}$ or $\ge 10\text{s}$ has elapsed since the last database write.

---

## 7. Existing Database Migration & Rollback Plan

### 7.1 Current Storage Architecture
* Local JSON file `.data/cabsafe-db.json` managed by `CabSafeRepository` (`src/server/repository.ts`).

### 7.2 Migration Procedure (`src/server/migrate-to-dynamodb.ts`)
1. **Non-Destructive Read:** Reads `.data/cabsafe-db.json` in read-only mode (never deletes or modifies the local file).
2. **Idempotent Upsert:** Iterates through `users`, `captains`, and `rides`, transforming each record to its DynamoDB item schema and writing with conditional checks or idempotent `PutCommand`.
3. **Post-Migration Verification:** Queries each migrated primary key and verifies item count, INR (`₹`) fare integrity, and Chennai coordinate validity.

### 7.3 Rollback Plan
1. Keep `.data/cabsafe-db.json` intact.
2. Set environment variable `PERSISTENCE_MODE=file` (default in local development) and restart the service to immediately revert to file-backed storage without data loss.
