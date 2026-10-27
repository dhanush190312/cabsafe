/**
 * Stage E — AWS Deployment & ALB Integration Verification Runner
 *
 * Usage:
 *   ALB_BASE_URL="https://<your-alb-dns-or-domain>" npx tsx infra/verify-aws-deployment.ts
 *
 * IMPORTANT: Do not run against paid AWS resources until deployment is approved.
 * Defaults to http://localhost:3000 when ALB_BASE_URL is not specified so the
 * verification script itself can be validated safely offline.
 */

const BASE_URL = (process.env.ALB_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

interface CheckResult {
  step: string;
  passed: boolean;
  details: string;
}

async function runVerification(): Promise<void> {
  const results: CheckResult[] = [];
  console.log(`\n=== CabSafe Chennai — Stage E Endpoint Verification (${BASE_URL}) ===\n`);

  // 1. ALB Target Group Health Check (/api/health)
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthJson = (await healthRes.json()) as {
    status: string;
    persistenceMode: string;
    awsRegion: string;
    operatingArea: string;
  };
  results.push({
    step: '1. ALB Health Check (GET /api/health)',
    passed: healthRes.status === 200 && healthJson.status === 'healthy',
    details: `HTTP ${healthRes.status} | mode=${healthJson.persistenceMode} | region=${healthJson.awsRegion} | area=${healthJson.operatingArea}`,
  });

  // 2. Deep Readiness & Chennai Map Center (GET /api/checkhealth + GET /admin/overview)
  const deepRes = await fetch(`${BASE_URL}/api/checkhealth`);
  const deepText = (await deepRes.text()).trim();
  const overviewRes = await fetch(`${BASE_URL}/admin/overview`);
  const overviewJson = (await overviewRes.json()) as {
    serviceArea?: {
      mapConfig?: { defaultCenter: { lat: number; lon: number }; defaultZoom: number };
    };
  };
  const center = overviewJson.serviceArea?.mapConfig?.defaultCenter;
  results.push({
    step: '2. Deep Readiness & Chennai Map Center (GET /api/checkhealth & /admin/overview)',
    passed:
      deepRes.status === 200 &&
      deepText === 'ok' &&
      center?.lat === 13.0827 &&
      center?.lon === 80.2707,
    details: `checkhealth="${deepText}" (HTTP ${deepRes.status}) | center=(${center?.lat}, ${center?.lon})`,
  });

  // 3. Passenger Login (POST /users/login)
  let authRes = await fetch(`${BASE_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'alex.passenger@cabsafe.demo',
      password: 'password123',
    }),
  });
  if (authRes.status === 401) {
    authRes = await fetch(`${BASE_URL}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullname: { firstname: 'Alex', lastname: 'Rivera' },
        email: 'alex.passenger@cabsafe.demo',
        phone: '+91 98401 23410',
        password: 'password123',
      }),
    });
  }
  const loginUserJson = (await authRes.json()) as { token?: string; user?: { _id: string } };
  const userToken = loginUserJson.token || '';
  results.push({
    step: '3. Passenger Login (POST /users/login)',
    passed: (authRes.status === 200 || authRes.status === 201) && Boolean(userToken),
    details: `HTTP ${authRes.status} | userId=${loginUserJson.user?._id || 'none'}`,
  });

  // 4. Chennai Fare Calculation in INR (GET /rides/get-fare)
  const fareRes = await fetch(
    `${BASE_URL}/rides/get-fare?pickup=T.%20Nagar&destination=Anna%20Nagar&pickupLat=13.0418&pickupLon=80.2341&destLat=13.0850&destLon=80.2101`,
    {
      headers: { Authorization: `Bearer ${userToken}` },
    }
  );
  const fareJson = (await fareRes.json()) as {
    car?: number;
    fares?: { car: number; moto: number; auto: number };
    breakdowns?: { car?: { currency?: string; totalFare?: number } };
  };
  const carFare = fareJson.fares?.car ?? fareJson.car;
  const currency = fareJson.breakdowns?.car?.currency || 'INR';
  results.push({
    step: '4. Chennai Fare Estimate in INR (GET /rides/get-fare)',
    passed: fareRes.status === 200 && currency === 'INR' && typeof carFare === 'number' && carFare > 0,
    details: `HTTP ${fareRes.status} | currency=${currency} | car=₹${carFare} | auto=₹${fareJson.fares?.auto} | moto=₹${fareJson.fares?.moto}`,
  });

  // 5. Out-of-Area Boundary Enforcement (Bengaluru rejected with HTTP 422)
  const outRes = await fetch(
    `${BASE_URL}/rides/get-fare?pickup=Bengaluru&destination=Anna%20Nagar&pickupLat=12.9716&pickupLon=77.5946&destLat=13.0850&destLon=80.2101`,
    {
      headers: { Authorization: `Bearer ${userToken}` },
    }
  );
  results.push({
    step: '5. Out-of-Area Boundary Enforcement (HTTP 422)',
    passed: outRes.status === 422,
    details: `HTTP ${outRes.status} (Expected 422 Unprocessable Entity for outside Chennai)`,
  });

  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.step} -> ${r.details}`);
  }

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.error(`\nVerification failed: ${failed.length} check(s) did not pass.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length}/${results.length} Stage E verification checks PASSED.\n`);
}

runVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
