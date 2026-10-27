# CabSafe Chennai 🚖
### Full-Stack Real-Time Ride Hailing Platform with Explainable Dispatch Intelligence

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-black?logo=express)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**CabSafe** is a modern, production-grade ride-hailing and dispatch orchestration platform built for Chennai, Tamil Nadu. Designed with an executive **White & Royal Red** design system, CabSafe combines real-time geospatial telemetry, transparent multi-factor driver matching, atomic state transactions, and dedicated console interfaces for passengers, captains (drivers), and dispatch administrators.

---

## 🌟 Core Highlights

### 1. 🎯 Explainable Multi-Factor Dispatch Intelligence
Unlike black-box matching algorithms, CabSafe calculates and visibly exposes deterministic driver rankings based on four transparent factors:
$$\text{Score} = 0.45 \cdot S_{\text{dist}} + 0.25 \cdot S_{\text{rating}} + 0.20 \cdot S_{\text{completion}} + 0.10 \cdot S_{\text{vehicle}}$$
- **Pickup Proximity ($45\%$)**: Real-time Haversine road proximity to rider.
- **Captain Rating ($25\%$)**: Historical rider satisfaction rating normalized to 5-star baseline.
- **Reliability Index ($20\%$)**: Ratio of completed rides to assigned rides.
- **Vehicle Compatibility ($10\%$)**: Exact tier match vs. category upgrade allowance.

### 2. 👥 Multi-Driver Browsing & Personalized Pricing
- **Fleet-Wide Visibility**: Passengers can view all available active captains in Chennai rather than being locked to a single opaque assignment.
- **Vehicle Tiers**: Seamless selection across **CabSafe Go (Sedans - 4 Seats)**, **CabSafe Auto (CNG - 3 Seats)**, and **CabSafe Moto (Express - 1 Seat)**.
- **Individual Driver Pricing**: Transparent, model-based fares reflecting vehicle comfort (e.g., Premium Hybrid Sedan vs. Standard Value Sedan).
- **Direct Captain Booking**: Passengers can tap and book with their preferred captain.

### 3. 🛡️ Authoritative Chennai Geofence & Security
- **Service Area Boundary**: Strict enforcement of the Chennai Metropolitan service polygon (centered at `13.0827°N, 80.2707°E`, covering Central Chennai, OMR Tech Corridor, and GST Highway). Requests outside the boundary return `422 OUTSIDE_SERVICE_AREA`.
- **Atomic Acceptance Locks**: Prevents race conditions where two captains accept the same ride simultaneously (`409 Conflict`).
- **OTP-Gated Ride Commencement**: 6-digit cryptographic handshake required from rider before trip status transitions to `ongoing`. Captains never receive the rider's OTP in server payloads.
- **Duplicate Ride Prevention**: Idempotency checks disallow concurrent active bookings by the same passenger.

### 4. 🗺️ Live Geospatial Telemetry
- **Dynamic Leaflet / OpenStreetMap Canvas**: Custom Chennai tile rendering, interactive pickup/drop-off pins, live road polyline interpolation via OSRM, and real-time captain telemetry animation.
- **Scoped Socket.IO GPS Relay**: Live vehicle location emits to passengers only while rides are active (`accepted` or `ongoing`), respecting driver privacy outside trips.

---

## 📱 Actor Touchpoints

| Workspace View | Description | Key Capabilities |
| :--- | :--- | :--- |
| **Passenger App** | Mobile viewport consumer client | 2-step location search, live route preview, multi-tier ride selection, captain picker, OTP display, trip completion receipts. |
| **Captain Console** | Driver dispatch & telemetry cockpit | Online/Offline toggle, incoming ride offer sheet, distance & match breakdown, rider OTP verification gate, GPS simulation stepper, earnings ledger. |
| **Admin Dispatch** | Central fleet operations command | Chennai polygon boundary monitor, real-time fleet map, active driver roster, explainable match audit logs, ride transaction ledger. |
| **Audit & Security** | Compliance & architecture console | HTTP API matrix, Socket.IO event dictionary, security boundary documentation, native Android SDK release blueprints. |

---

## 🛠️ Tech Stack & Architecture

```
cabsafe/
├── server.ts                       # Express HTTP API + Socket.IO server + Vite SSR integration
├── src/
│   ├── components/
│   │   ├── PassengerApp.tsx        # Rider booking lifecycle (Stages 01–08)
│   │   ├── CaptainApp.tsx          # Driver telemetry & ride fulfillment console
│   │   ├── AdminAndAuditView.tsx   # Fleet management & dispatch audit matrix
│   │   ├── LiveMap.tsx             # Interactive Leaflet map canvas & route visualizer
│   │   ├── SimulationCard.tsx      # Desktop dispatch testing & telemetry simulator
│   │   ├── MobileFrame.tsx         # Responsive mobile viewport harness
│   │   └── TopDownCarSvg.tsx       # Dynamic vehicle vector with heading rotation
│   ├── server/
│   │   ├── domain.ts               # Core domain models, ranking math, boundary polygons
│   │   ├── repository.ts           # Atomic file-backed repository with JSON persistence
│   │   ├── dynamodb-repository.ts  # Enterprise AWS DynamoDB repository adapter
│   │   └── geo.ts                  # OSRM routing, Nominatim reverse geocode & Photon autocomplete
│   ├── config/
│   │   └── chennaiServiceArea.ts   # Chennai boundary polygon coordinates & corridors
│   ├── types.ts                    # Shared TypeScript interfaces & API client utilities
│   ├── App.tsx                     # Main layout shell with role switcher & socket coordinator
│   ├── index.css                   # Tailwind CSS v4 styling & map animation keyframes
│   └── main.tsx                    # React DOM client entrypoint
└── docs/                           # AWS Deployment & Architecture guides
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm**

### 1. Clone the Repository
```bash
git clone https://github.com/dhanush190312/cabsafe.git
cd cabsafe
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (or copy from `.env.example`):
```env
PORT=3000
JWT_SECRET=cabsafe-super-secret-jwt-key-2026
PERSISTENCE_MODE=file
AWS_REGION=ap-south-1
```

### 4. Run the Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🧪 Demo Credentials

The platform is pre-seeded with instant demo accounts:

### Passenger Account
- **Email**: `alex.passenger@cabsafe.demo`
- **Password**: `password123`

### Captain Accounts
| Captain Name | Vehicle Tier | Vehicle Model | Plate | Locality |
| :--- | :--- | :--- | :--- | :--- |
| **Marcus Vance** | CabSafe Go (Car) | Toyota Camry Hybrid | `TN-09-CB-8921` | T. Nagar (Central) |
| **Elena Rostova** | CabSafe Go (Car) | Honda City ZX | `TN-01-AQ-4402` | Anna Nagar (North) |
| **Tariq Hassan** | CabSafe Auto (CNG) | Bajaj RE Compact | `TN-07-CN-3718` | Adyar (South) |
| **Kenji Takahashi** | CabSafe Moto (Moto) | TVS Apache RTR 200 | `TN-10-MT-5501` | Guindy (South-West) |

*(Password for all demo captain accounts is `password123`)*

---

## 📡 API & Socket.IO Reference

### Core REST Endpoints
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/maps/service-area` | Public | Returns Chennai boundary polygon & center coordinates |
| `GET` | `/rides/get-fare` | Authenticated | Calculates distance, duration, multi-tier fares & driver rankings |
| `POST` | `/rides/create` | Rider | Dispatches ride request to ranked Chennai drivers |
| `POST` | `/rides/confirm` | Captain | Atomically claims a pending ride (`409` if claimed) |
| `POST` | `/rides/start-ride` | Captain | Verifies rider 6-digit OTP and begins trip |
| `POST` | `/rides/end-ride` | Captain | Concludes ride, settles fare, and records metrics |
| `POST` | `/captains/location` | Captain | Updates captain live GPS coordinates |

### Real-Time Socket Events
- `join`: Authenticates socket connection with JWT and joins actor room.
- `update-location-captain`: Emits live GPS coordinate update from driver.
- `new-ride`: Dispatches sanitized ride offer & match explanation to eligible captains.
- `ride-confirmed`: Notifies passenger that a captain has accepted with OTP.
- `captain-location-updated`: Streams captain's live coordinates to passenger during active ride.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
