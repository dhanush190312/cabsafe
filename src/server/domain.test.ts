import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHENNAI_MAP_CONFIG,
  URBAN_LANDMARKS,
  OUTSIDE_CHENNAI_REFERENCE_LOCATIONS,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  calculateHaversineKm,
  calculateFaresFromDistanceAndDuration,
  rankCaptainsExplainably,
  isValidRideTransition,
  sanitizeRideForRole,
  generateOtp,
} from './domain';
import { CabSafeRepository } from './repository';
import {
  resolveAddressCoordinate,
  resolveDistanceAndTime,
  getAutocompleteSuggestions,
  extractCoordinatesFromText,
} from './geo';

test('1. Chennai Map Configuration & Provisional Boundary validate all 10+ Chennai localities and reject outside points', () => {
  assert.equal(CHENNAI_MAP_CONFIG.defaultCenter.lat, 13.0827);
  assert.equal(CHENNAI_MAP_CONFIG.defaultCenter.lon, 80.2707);
  assert.equal(CHENNAI_MAP_CONFIG.defaultZoom, 12);

  // Every curated Chennai locality (T. Nagar, Anna Nagar, Adyar, Velachery, Guindy, Tambaram, Sholinganallur, Thoraipakkam, Perungudi, OMR) must be inside
  for (const landmark of URBAN_LANDMARKS) {
    const inside = isPointInChennaiServiceArea({ lat: landmark.lat, lon: landmark.lon });
    assert.equal(
      inside,
      true,
      `Expected Chennai locality ${landmark.name} (${landmark.lat}, ${landmark.lon}) to be inside provisional boundary`
    );
  }

  // Every outside reference point (Mahabalipuram, Kanchipuram, Sriperumbudur, Puducherry, Bengaluru) must be rejected
  for (const outPlace of OUTSIDE_CHENNAI_REFERENCE_LOCATIONS) {
    const inside = isPointInChennaiServiceArea({ lat: outPlace.lat, lon: outPlace.lon });
    assert.equal(
      inside,
      false,
      `Expected out-of-area location ${outPlace.name} (${outPlace.lat}, ${outPlace.lon}) to be outside boundary`
    );
  }

  const tNagar = { lat: 13.0418, lon: 80.2341 };
  const velachery = { lat: 12.9784, lon: 80.218 };
  const mahabalipuram = { lat: 12.6208, lon: 80.1945 };

  assert.equal(validateChennaiTripEndpoints(tNagar, velachery).valid, true);
  assert.equal(
    validateChennaiTripEndpoints(mahabalipuram, velachery).code,
    'PICKUP_OUTSIDE_SERVICE_AREA'
  );
  assert.equal(
    validateChennaiTripEndpoints(tNagar, mahabalipuram).code,
    'DESTINATION_OUTSIDE_SERVICE_AREA'
  );
  assert.equal(
    validateChennaiTripEndpoints(mahabalipuram, { lat: 12.9716, lon: 77.5946 }).code,
    'BOTH_OUTSIDE_SERVICE_AREA'
  );
});

test('2. Chennai Geocoding & Route Service preserve exact map-selected coordinates and reject out-of-area routes (422)', async () => {
  // Exact map-pinned coordinates must never be silently moved
  const pinnedText = 'Near T. Nagar, Chennai (13.0418, 80.2341)';
  const extracted = extractCoordinatesFromText(pinnedText);
  assert.deepEqual(extracted, { lat: 13.0418, lon: 80.2341 });

  const resolvedPin = await resolveAddressCoordinate(pinnedText);
  assert.deepEqual(resolvedPin.coords, { lat: 13.0418, lon: 80.2341 });
  assert.equal(resolvedPin.inServiceArea, true);

  // Out-of-area city resolves to its real coordinates (not snapped to Chennai) and is flagged outside
  const resolvedOutside = await resolveAddressCoordinate('Mahabalipuram');
  assert.equal(resolvedOutside.inServiceArea, false);
  assert.ok(resolvedOutside.coords.lat < 12.8, 'Should keep real Mahabalipuram latitude');

  // Route & distance calculation between T. Nagar and Sholinganallur OMR succeeds
  const validRoute = await resolveDistanceAndTime('T. Nagar', 'Sholinganallur');
  assert.ok(validRoute.distance.value > 5000);
  assert.ok(validRoute.duration.value > 300);
  assert.ok(validRoute.routeGeometry.length >= 2);

  // Route calculation from T. Nagar to Bengaluru or Mahabalipuram is rejected with 422
  await assert.rejects(
    async () => {
      await resolveDistanceAndTime('T. Nagar', 'Bengaluru MG Road');
    },
    (err: Error & { statusCode?: number; code?: string }) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, 'DESTINATION_OUTSIDE_SERVICE_AREA');
      return true;
    }
  );

  // Suggestions for "Anna Nagar" return Chennai results
  const suggestions = await getAutocompleteSuggestions('Anna Nagar');
  assert.ok(suggestions.length >= 1);
  assert.match(suggestions[0].display_name, /Anna Nagar.*Chennai/i);
});

test('3. OTP generator, Haversine distance, and tiered fare calculation return accurate pricing', () => {
  for (let i = 0; i < 20; i++) {
    const otp = generateOtp(6);
    assert.equal(otp.length, 6);
    assert.match(otp, /^\d{6}$/);
  }

  const tNagar = { lat: 13.0418, lon: 80.2341 };
  const adyar = { lat: 13.0067, lon: 80.2572 };
  const km = calculateHaversineKm(tNagar, adyar);
  assert.ok(km > 4.0 && km < 5.5, `Expected ~4.63 km between T. Nagar and Adyar, got ${km}`);

  const { fares, breakdowns } = calculateFaresFromDistanceAndDuration(5300, 720);
  assert.ok(fares.car > fares.cng, 'Car fare should exceed CNG fare');
  assert.ok(fares.cng > fares.motorcycle, 'CNG fare should exceed motorcycle fare');
  assert.equal(
    Number(
      (
        breakdowns.car.baseFare +
        breakdowns.car.distanceFare +
        breakdowns.car.timeFare
      ).toFixed(2)
    ),
    fares.car
  );
});

test('4. Explainable Multi-Factor Driver Matching ranks active Chennai captains transparently', () => {
  const repo = new CabSafeRepository({ persist: false });
  const captains = repo.listCaptains();
  const pickupTNagar = { lat: 13.0418, lon: 80.2341 }; // Very close to Marcus Vance in T. Nagar

  const rankings = rankCaptainsExplainably(captains, pickupTNagar, 'car');
  assert.ok(rankings.length >= 2, 'Should rank multiple eligible car captains in Chennai');
  assert.equal(rankings[0].captainName, 'Marcus Vance');
  assert.ok(rankings[0].finalScore > rankings[1].finalScore);

  const top = rankings[0];
  const sumWeighted = Number(
    (
      top.scoreBreakdown.distance.weighted +
      top.scoreBreakdown.rating.weighted +
      top.scoreBreakdown.completion.weighted +
      top.scoreBreakdown.vehicle.weighted
    ).toFixed(1)
  );
  assert.equal(sumWeighted, top.finalScore);
  assert.match(top.explanation, /Matched Marcus Vance/);
});

test('5. Stage 6 Security Audit: Auth, invalid login, expired/blacklisted tokens, and out-of-area rejection', async () => {
  const repo = new CabSafeRepository({ persist: false });

  // Register separate passenger
  const { user, token } = await repo.registerUser({
    firstname: 'Karthik',
    lastname: 'Subramanian',
    email: 'karthik.chennai@example.com',
    password: 'securePassword123',
  });
  assert.equal(user.email, 'karthik.chennai@example.com');
  assert.equal((user as Record<string, unknown>).password, undefined);

  // Invalid login password must fail
  await assert.rejects(
    async () => {
      await repo.loginUser('karthik.chennai@example.com', 'wrongPassword');
    },
    /Invalid email or password/
  );

  // Expired JWT token must fail verification
  const expiredToken = repo.signToken(user._id, 'user', '-10s');
  assert.equal(repo.verifyToken(expiredToken), null);

  // Blacklisted token on logout must fail verification
  repo.blacklistToken(token);
  assert.equal(repo.isTokenBlacklisted(token), true);
  assert.equal(repo.verifyToken(token), null);

  // Backend repository rejects ride creation outside Chennai boundary (422)
  assert.throws(
    () => {
      repo.createRide({
        userId: user._id,
        pickup: 'Mahabalipuram Shore Temple',
        destination: 'T. Nagar, Chennai',
        pickupCoords: { lat: 12.6208, lon: 80.1945 }, // Outside Chennai
        destinationCoords: { lat: 13.0418, lon: 80.2341 },
        vehicleType: 'car',
        distanceMeters: 45000,
        durationSeconds: 3600,
        dataSource: 'fallback_geodata',
      });
    },
    (err: Error & { statusCode?: number; code?: string }) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, 'PICKUP_OUTSIDE_SERVICE_AREA');
      return true;
    }
  );
});

test('6. Stage 6 Complete 13-Step E2E Workflow, Duplicate Ride Guard (409), Atomic Lock (409), OTP Secrecy & Live GPS Boundary Check', async () => {
  const repo = new CabSafeRepository({ persist: false });

  // Step 1 & 2: Separate Passenger & Driver registration/login
  const passengerAuth = await repo.loginUser('alex.passenger@cabsafe.demo', 'password123');
  const captain1Auth = await repo.loginCaptain('marcus.captain@cabsafe.demo', 'password123');
  const captain2Auth = await repo.loginCaptain('elena.captain@cabsafe.demo', 'password123');

  // Step 3–5: Passenger creates a Chennai ride (T. Nagar -> Guindy)
  const ride = repo.createRide({
    userId: passengerAuth.user._id,
    pickup: 'T. Nagar, Panagal Park, Chennai',
    destination: 'Guindy Industrial Estate, Chennai',
    pickupCoords: { lat: 13.0418, lon: 80.2341 },
    destinationCoords: { lat: 13.0067, lon: 80.2206 },
    vehicleType: 'car',
    distanceMeters: 4800,
    durationSeconds: 660,
    dataSource: 'fallback_geodata',
  });
  assert.equal(ride.status, 'pending');
  assert.ok(ride.otp && ride.otp.length === 6);

  // Duplicate active ride submission by the same passenger is blocked with 409 Conflict
  assert.throws(
    () => {
      repo.createRide({
        userId: passengerAuth.user._id,
        pickup: 'Anna Nagar, Chennai',
        destination: 'Adyar, Chennai',
        pickupCoords: { lat: 13.085, lon: 80.2101 },
        destinationCoords: { lat: 13.0067, lon: 80.2572 },
        vehicleType: 'car',
        distanceMeters: 9200,
        durationSeconds: 1200,
        dataSource: 'fallback_geodata',
      });
    },
    (err: Error & { statusCode?: number; code?: string }) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'DUPLICATE_ACTIVE_RIDE');
      return true;
    }
  );

  // Step 6 & 7: Captain 1 accepts the ride; Captain 2 concurrent accept is rejected with 409 Conflict
  const acceptedRide = repo.confirmRideAtomically(ride._id, captain1Auth.captain._id);
  assert.equal(acceptedRide.status, 'accepted');

  assert.throws(
    () => {
      repo.confirmRideAtomically(ride._id, captain2Auth.captain._id);
    },
    (err: Error & { statusCode?: number }) => {
      assert.equal(err.statusCode, 409);
      return true;
    }
  );

  // Step 8: Role sanitization strips OTP for captain but preserves it for passenger
  const captainView = sanitizeRideForRole(acceptedRide, 'captain');
  const passengerView = sanitizeRideForRole(acceptedRide, 'user');
  assert.equal(captainView.otp, undefined);
  assert.equal(passengerView.otp, ride.otp);

  // Unauthorized captain (Captain 2) cannot start the ride (403 Forbidden)
  assert.throws(
    () => {
      repo.startRideWithOtp({
        rideId: ride._id,
        otp: ride.otp!,
        authenticatedCaptainId: captain2Auth.captain._id,
      });
    },
    (err: Error & { statusCode?: number }) => {
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  // Invalid OTP is rejected (400 Bad Request)
  assert.throws(
    () => {
      repo.startRideWithOtp({
        rideId: ride._id,
        otp: '000000',
        authenticatedCaptainId: captain1Auth.captain._id,
      });
    },
    (err: Error & { statusCode?: number }) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Step 9 & 10: Valid OTP starts trip -> status transitions to 'ongoing'
  const ongoing = repo.startRideWithOtp({
    rideId: ride._id,
    otp: ride.otp!,
    authenticatedCaptainId: captain1Auth.captain._id,
  });
  assert.equal(ongoing.status, 'ongoing');
  assert.equal(isValidRideTransition('ongoing', 'cancelled'), false);

  // Step 11: Captain live location update inside Chennai succeeds; outside Chennai is rejected (422)
  const updatedCap = repo.updateCaptainLocation(captain1Auth.captain._id, {
    lat: 13.0215,
    lon: 80.2285,
  });
  assert.deepEqual(updatedCap.location.coordinates, [80.2285, 13.0215]);

  assert.throws(
    () => {
      repo.updateCaptainLocation(captain1Auth.captain._id, {
        lat: 12.6208,
        lon: 80.1945, // Mahabalipuram (outside boundary)
      });
    },
    (err: Error & { statusCode?: number; code?: string }) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, 'CAPTAIN_LOCATION_OUTSIDE_SERVICE_AREA');
      return true;
    }
  );

  // Step 12 & 13: Captain completes trip and Passenger settles receipt + 5-star rating
  const completed = repo.endRide({
    rideId: ride._id,
    authenticatedCaptainId: captain1Auth.captain._id,
  });
  assert.equal(completed.status, 'completed');

  const rated = repo.payAndRateRide({
    rideId: ride._id,
    userId: passengerAuth.user._id,
    paymentMethod: 'Wallet',
    rating: 5,
    feedback: 'Prompt pickup at Panagal Park!',
  });
  assert.equal(rated.paymentStatus, 'paid');
  assert.equal(rated.userRating, 5);
});
