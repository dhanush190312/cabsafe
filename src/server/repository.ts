import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  UserRecord,
  CaptainRecord,
  RideRecord,
  Coordinates,
  VehicleType,
  CHENNAI_MAP_CONFIG,
  generateOtp,
  rankCaptainsExplainably,
  calculateFaresFromDistanceAndDuration,
  interpolateRouteGeometry,
  isValidRideTransition,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  isValidCoordinatePair,
  sanitizeUser,
  sanitizeCaptain,
} from './domain';

export interface BlacklistTokenRecord {
  token: string;
  createdAt: number;
}

export interface DatabaseSchema {
  users: UserRecord[];
  captains: CaptainRecord[];
  rides: RideRecord[];
  blacklistTokens: BlacklistTokenRecord[];
}

const JWT_SECRET = process.env.JWT_SECRET || 'cabsafe-production-jwt-secret-key-2026';

export class CabSafeRepository {
  private filePath: string;
  private data: DatabaseSchema;
  private persistEnabled: boolean;

  constructor(options?: { filePath?: string; persist?: boolean }) {
    this.persistEnabled = options?.persist ?? true;
    this.filePath =
      options?.filePath ||
      process.env.DATA_FILE_PATH ||
      path.resolve(process.cwd(), '.data', 'cabsafe-db.json');

    this.data = {
      users: [],
      captains: [],
      rides: [],
      blacklistTokens: [],
    };

    this.loadOrSeed();
  }

  private loadOrSeed() {
    if (this.persistEnabled && fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.captains)) {
          // Ensure persisted captains are inside Chennai (migrate any legacy non-Chennai DB automatically)
          const firstCap = parsed.captains[0];
          const firstCoords = firstCap?.location?.coordinates;
          const firstRideFare = parsed.rides?.[0]?.fare ?? 0;
          const isChennaiInrSeeded =
            Array.isArray(firstCoords) &&
            isPointInChennaiServiceArea({ lon: firstCoords[0], lat: firstCoords[1] }) &&
            firstRideFare >= 50;
          if (isChennaiInrSeeded) {
            this.data = parsed;
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to parse persisted DB, re-seeding Chennai INR default state:', e);
      }
    }
    this.seedDefaultsSync();
  }

  public seedDefaultsSync() {
    const passwordHash = bcrypt.hashSync('password123', 10);
    const now = new Date().toISOString();

    const demoUsers: UserRecord[] = [
      {
        _id: '671a00000000000000000001',
        fullname: { firstname: 'Alex', lastname: 'Rivera' },
        email: 'alex.passenger@cabsafe.demo',
        phone: '+91 98401 23410',
        password: passwordHash,
        socketId: null,
        rating: 4.92,
        createdAt: now,
      },
      {
        _id: '671a00000000000000000002',
        fullname: { firstname: 'Priya', lastname: 'Nair' },
        email: 'priya.passenger@cabsafe.demo',
        phone: '+91 98402 61298',
        password: passwordHash,
        socketId: null,
        rating: 4.88,
        createdAt: now,
      },
    ];

    const demoCaptains: CaptainRecord[] = [
      {
        _id: '671b00000000000000000101',
        fullname: { firstname: 'Marcus', lastname: 'Vance' },
        email: 'marcus.captain@cabsafe.demo',
        phone: '+91 98407 01441',
        password: passwordHash,
        socketId: null,
        status: 'active',
        vehicle: {
          color: 'Obsidian Black',
          plate: 'TN-09-CB-8921',
          capacity: 4,
          vehicleType: 'car',
          model: 'Toyota Camry Hybrid',
        },
        location: {
          type: 'Point',
          coordinates: [80.2365, 13.0432], // T. Nagar (near Panagal Park)
          updatedAt: now,
        },
        metrics: {
          rating: 4.94,
          completedRides: 148,
          assignedRides: 152,
          totalEarnings: 48450.5,
          distanceKm: 1120.4,
          hoursOnline: 184.5,
        },
        createdAt: now,
      },
      {
        _id: '671b00000000000000000102',
        fullname: { firstname: 'Elena', lastname: 'Rostova' },
        email: 'elena.captain@cabsafe.demo',
        phone: '+91 98403 92880',
        password: passwordHash,
        socketId: null,
        status: 'active',
        vehicle: {
          color: 'Pearl White',
          plate: 'TN-01-AQ-4402',
          capacity: 4,
          vehicleType: 'car',
          model: 'Honda City ZX',
        },
        location: {
          type: 'Point',
          coordinates: [80.2125, 13.0842], // Anna Nagar
          updatedAt: now,
        },
        metrics: {
          rating: 4.86,
          completedRides: 92,
          assignedRides: 98,
          totalEarnings: 31710.25,
          distanceKm: 684.2,
          hoursOnline: 112.0,
        },
        createdAt: now,
      },
      {
        _id: '671b00000000000000000103',
        fullname: { firstname: 'Tariq', lastname: 'Hassan' },
        email: 'tariq.captain@cabsafe.demo',
        phone: '+91 98405 52193',
        password: passwordHash,
        socketId: null,
        status: 'active',
        vehicle: {
          color: 'Amber Yellow',
          plate: 'TN-07-CN-3718',
          capacity: 3,
          vehicleType: 'cng',
          model: 'Bajaj RE Compact CNG',
        },
        location: {
          type: 'Point',
          coordinates: [80.2548, 13.0085], // Adyar
          updatedAt: now,
        },
        metrics: {
          rating: 4.91,
          completedRides: 210,
          assignedRides: 215,
          totalEarnings: 42490.0,
          distanceKm: 940.0,
          hoursOnline: 205.2,
        },
        createdAt: now,
      },
      {
        _id: '671b00000000000000000104',
        fullname: { firstname: 'Kenji', lastname: 'Takahashi' },
        email: 'kenji.captain@cabsafe.demo',
        phone: '+91 98408 84301',
        password: passwordHash,
        socketId: null,
        status: 'active',
        vehicle: {
          color: 'Racing Silver',
          plate: 'TN-10-MT-5501',
          capacity: 1,
          vehicleType: 'motorcycle',
          model: 'Ather 450X Electric',
        },
        location: {
          type: 'Point',
          coordinates: [80.2215, 13.0052], // Guindy
          updatedAt: now,
        },
        metrics: {
          rating: 4.97,
          completedRides: 315,
          assignedRides: 318,
          totalEarnings: 53120.75,
          distanceKm: 1410.8,
          hoursOnline: 240.0,
        },
        createdAt: now,
      },
    ];

    const pastTime = new Date(Date.now() - 1000 * 60 * 55).toISOString();
    const completedTime = new Date(Date.now() - 1000 * 60 * 35).toISOString();

    const originCoords: Coordinates = { lat: 13.0418, lon: 80.2341 }; // T. Nagar
    const destCoords: Coordinates = { lat: 13.0067, lon: 80.2572 }; // Adyar
    const rankings = rankCaptainsExplainably(demoCaptains, originCoords, 'car');

    const demoRides: RideRecord[] = [
      {
        _id: '671c00000000000000000501',
        user: sanitizeUser(demoUsers[0]),
        captain: sanitizeCaptain(demoCaptains[0]),
        pickup: 'T. Nagar, Panagal Park, Thyagaraya Nagar, Chennai, Tamil Nadu',
        destination: 'Adyar, Sardar Patel Rd & LB Road Junction, Chennai, Tamil Nadu',
        pickupCoords: originCoords,
        destinationCoords: destCoords,
        routeGeometry: interpolateRouteGeometry(originCoords, destCoords),
        vehicleType: 'car',
        fare: 185.58,
        fareBreakdown: {
          baseFare: 60.0,
          distanceFare: 95.58,
          timeFare: 30.0,
          total: 185.58,
        },
        status: 'completed',
        duration: 720,
        distance: 5310,
        otp: '482910',
        paymentStatus: 'paid',
        paymentMethod: 'Card',
        userRating: 5,
        userFeedback: 'Smooth ride across Anna Salai and Sardar Patel Road.',
        matchExplanation: rankings[0] || null,
        candidateRankings: rankings,
        dataSource: 'fallback_geodata',
        createdAt: pastTime,
        acceptedAt: pastTime,
        startedAt: pastTime,
        completedAt: completedTime,
      },
    ];

    this.data = {
      users: demoUsers,
      captains: demoCaptains,
      rides: demoRides,
      blacklistTokens: [],
    };
    this.save();
  }

  private save() {
    if (!this.persistEnabled) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Could not persist database file:', e);
    }
  }

  private generateObjectId(prefix = '671f'): string {
    const hex = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
    const rand = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `${prefix}${hex}${rand}`.slice(0, 24);
  }

  // ---------------- JWT & Auth Helpers ----------------

  public signToken(
    id: string,
    role: 'user' | 'captain',
    expiresIn: string | number = '24h'
  ): string {
    return jwt.sign({ _id: id, role }, JWT_SECRET, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  public verifyToken(token: string): { _id: string; role?: 'user' | 'captain' } | null {
    if (!token || this.isTokenBlacklisted(token)) {
      return null;
    }
    try {
      return jwt.verify(token, JWT_SECRET) as { _id: string; role?: 'user' | 'captain' };
    } catch {
      return null;
    }
  }

  public blacklistToken(token: string): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.data.blacklistTokens = this.data.blacklistTokens.filter((t) => t.createdAt > cutoff);
    if (!this.data.blacklistTokens.some((t) => t.token === token)) {
      this.data.blacklistTokens.push({ token, createdAt: Date.now() });
      this.save();
    }
  }

  public isTokenBlacklisted(token: string): boolean {
    return this.data.blacklistTokens.some((t) => t.token === token);
  }

  // ---------------- User Operations ----------------

  public async registerUser(input: {
    firstname: string;
    lastname?: string;
    email: string;
    phone?: string;
    password: string;
  }): Promise<{ user: Omit<UserRecord, 'password'>; token: string }> {
    const emailNorm = input.email.trim().toLowerCase();
    const existing = this.data.users.find((u) => u.email.toLowerCase() === emailNorm);
    if (existing) {
      throw new Error('User already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const newUser: UserRecord = {
      _id: this.generateObjectId('671a'),
      fullname: {
        firstname: input.firstname.trim(),
        lastname: (input.lastname || '').trim(),
      },
      email: emailNorm,
      phone: input.phone?.trim() || '+91 98400 10000',
      password: passwordHash,
      socketId: null,
      rating: 5.0,
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(newUser);
    this.save();
    const token = this.signToken(newUser._id, 'user');
    return { user: sanitizeUser(newUser), token };
  }

  public async loginUser(
    email: string,
    password: string
  ): Promise<{ user: Omit<UserRecord, 'password'>; token: string }> {
    const emailNorm = email.trim().toLowerCase();
    const user = this.data.users.find((u) => u.email.toLowerCase() === emailNorm);
    if (!user || !user.password) {
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error('Invalid email or password');
    }
    const token = this.signToken(user._id, 'user');
    return { user: sanitizeUser(user), token };
  }

  public findUserById(userId: string): UserRecord | undefined {
    return this.data.users.find((u) => u._id === userId);
  }

  public updateUserProfile(
    userId: string,
    updates: { firstname?: string; lastname?: string; phone?: string }
  ): Omit<UserRecord, 'password'> {
    const user = this.findUserById(userId);
    if (!user) throw new Error('User not found');
    if (updates.firstname && updates.firstname.trim().length >= 3) {
      user.fullname.firstname = updates.firstname.trim();
    }
    if (updates.lastname !== undefined) {
      user.fullname.lastname = updates.lastname.trim();
    }
    if (updates.phone !== undefined) {
      user.phone = updates.phone.trim();
    }
    this.save();
    return sanitizeUser(user);
  }

  // ---------------- Captain Operations ----------------

  public async registerCaptain(input: {
    fullname: { firstname: string; lastname?: string };
    email: string;
    phone?: string;
    password: string;
    vehicle: {
      color: string;
      plate: string;
      capacity: number;
      vehicleType: VehicleType;
      model?: string;
    };
  }): Promise<{ captain: Omit<CaptainRecord, 'password'>; token: string }> {
    const emailNorm = input.email.trim().toLowerCase();
    const existing = this.data.captains.find((c) => c.email.toLowerCase() === emailNorm);
    if (existing) {
      throw new Error('Captain already exist');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const now = new Date().toISOString();
    const newCaptain: CaptainRecord = {
      _id: this.generateObjectId('671b'),
      fullname: {
        firstname: input.fullname.firstname.trim(),
        lastname: (input.fullname.lastname || '').trim(),
      },
      email: emailNorm,
      phone: input.phone?.trim() || '+91 98400 20000',
      password: passwordHash,
      socketId: null,
      status: 'active',
      vehicle: {
        color: input.vehicle.color.trim(),
        plate: input.vehicle.plate.trim().toUpperCase(),
        capacity: Number(input.vehicle.capacity),
        vehicleType: input.vehicle.vehicleType,
        model: input.vehicle.model?.trim() || 'Standard Sedan',
      },
      location: {
        type: 'Point',
        coordinates: [
          CHENNAI_MAP_CONFIG.defaultCenter.lon,
          CHENNAI_MAP_CONFIG.defaultCenter.lat,
        ],
        updatedAt: now,
      },
      metrics: {
        rating: 4.9,
        completedRides: 1,
        assignedRides: 1,
        totalEarnings: 0,
        distanceKm: 0,
        hoursOnline: 1.0,
      },
      createdAt: now,
    };

    this.data.captains.push(newCaptain);
    this.save();
    const token = this.signToken(newCaptain._id, 'captain');
    return { captain: sanitizeCaptain(newCaptain), token };
  }

  public async loginCaptain(
    email: string,
    password: string
  ): Promise<{ captain: Omit<CaptainRecord, 'password'>; token: string }> {
    const emailNorm = email.trim().toLowerCase();
    const captain = this.data.captains.find((c) => c.email.toLowerCase() === emailNorm);
    if (!captain || !captain.password) {
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, captain.password);
    if (!valid) {
      throw new Error('Invalid email or password');
    }
    captain.status = 'active';
    this.save();
    const token = this.signToken(captain._id, 'captain');
    return { captain: sanitizeCaptain(captain), token };
  }

  public findCaptainById(captainId: string): CaptainRecord | undefined {
    return this.data.captains.find((c) => c._id === captainId);
  }

  public listCaptains(): Omit<CaptainRecord, 'password'>[] {
    return this.data.captains.map(sanitizeCaptain);
  }

  public updateCaptainStatus(
    captainId: string,
    status: 'active' | 'inactive'
  ): Omit<CaptainRecord, 'password'> {
    const captain = this.findCaptainById(captainId);
    if (!captain) throw new Error('Captain not found');
    captain.status = status;
    this.save();
    return sanitizeCaptain(captain);
  }

  public updateCaptainProfile(
    captainId: string,
    updates: {
      firstname?: string;
      lastname?: string;
      phone?: string;
      vehicle?: Partial<CaptainRecord['vehicle']>;
    }
  ): Omit<CaptainRecord, 'password'> {
    const captain = this.findCaptainById(captainId);
    if (!captain) throw new Error('Captain not found');
    if (updates.firstname && updates.firstname.trim().length >= 3) {
      captain.fullname.firstname = updates.firstname.trim();
    }
    if (updates.lastname !== undefined) {
      captain.fullname.lastname = updates.lastname.trim();
    }
    if (updates.phone !== undefined) {
      captain.phone = updates.phone.trim();
    }
    if (updates.vehicle) {
      if (updates.vehicle.color && updates.vehicle.color.trim().length >= 3) {
        captain.vehicle.color = updates.vehicle.color.trim();
      }
      if (updates.vehicle.plate && updates.vehicle.plate.trim().length >= 3) {
        captain.vehicle.plate = updates.vehicle.plate.trim().toUpperCase();
      }
      if (updates.vehicle.capacity && Number(updates.vehicle.capacity) >= 1) {
        captain.vehicle.capacity = Number(updates.vehicle.capacity);
      }
      if (
        updates.vehicle.vehicleType &&
        ['car', 'cng', 'motorcycle'].includes(updates.vehicle.vehicleType)
      ) {
        captain.vehicle.vehicleType = updates.vehicle.vehicleType;
      }
      if (updates.vehicle.model) {
        captain.vehicle.model = updates.vehicle.model.trim();
      }
    }
    this.save();
    return sanitizeCaptain(captain);
  }

  /**
   * Updates an authenticated captain's live coordinates.
   * Enforces valid coordinate bounds AND the Chennai operating service boundary.
   */
  public updateCaptainLocation(
    captainId: string,
    coords: Coordinates
  ): Omit<CaptainRecord, 'password'> {
    const captain = this.findCaptainById(captainId);
    if (!captain) throw new Error('Captain not found');
    if (!isValidCoordinatePair(coords)) {
      const err = new Error('Invalid coordinates');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
    if (!isPointInChennaiServiceArea(coords)) {
      const err = new Error(
        'Captain location update rejected: coordinates are outside the supported Chennai operating boundary'
      );
      (err as Error & { statusCode?: number; code?: string }).statusCode = 422;
      (err as Error & { statusCode?: number; code?: string }).code =
        'CAPTAIN_LOCATION_OUTSIDE_SERVICE_AREA';
      throw err;
    }
    captain.location = {
      type: 'Point',
      coordinates: [Number(coords.lon.toFixed(6)), Number(coords.lat.toFixed(6))],
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return sanitizeCaptain(captain);
  }

  // ---------------- Socket Binding ----------------

  public bindSocket(userType: 'user' | 'captain', userId: string, socketId: string) {
    if (userType === 'user') {
      const user = this.findUserById(userId);
      if (!user) throw new Error('User not found');
      user.socketId = socketId;
    } else if (userType === 'captain') {
      const captain = this.findCaptainById(userId);
      if (!captain) throw new Error('Captain not found');
      captain.socketId = socketId;
      captain.status = 'active';
    }
    this.save();
  }

  public clearSocket(socketId: string) {
    for (const u of this.data.users) {
      if (u.socketId === socketId) {
        u.socketId = null;
      }
    }
    for (const c of this.data.captains) {
      if (c.socketId === socketId) {
        c.socketId = null;
      }
    }
    this.save();
  }

  // ---------------- Ride Lifecycle Operations ----------------

  public createRide(params: {
    userId: string;
    pickup: string;
    destination: string;
    pickupCoords: Coordinates;
    destinationCoords: Coordinates;
    vehicleType: VehicleType;
    distanceMeters: number;
    durationSeconds: number;
    routeGeometry?: [number, number][];
    dataSource: 'live_osm' | 'fallback_geodata';
    allowMultipleActive?: boolean;
    preferredCaptainId?: string;
  }): RideRecord {
    const user = this.findUserById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Authoritative backend enforcement of the Chennai service boundary
    const boundaryValidation = validateChennaiTripEndpoints(
      params.pickupCoords,
      params.destinationCoords
    );
    if (!boundaryValidation.valid) {
      const err = new Error(
        boundaryValidation.message || 'Ride endpoints are outside the Chennai service area'
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 422;
      err.code = boundaryValidation.code || 'OUTSIDE_SERVICE_AREA';
      throw err;
    }

    // Prevent duplicate concurrent ride submissions by the same passenger
    if (!params.allowMultipleActive) {
      const existingActive = this.getActiveRideForActor('user', params.userId);
      if (existingActive) {
        const err = new Error(
          'Passenger already has an active ride request in progress. Cancel or complete the current ride before creating a new one.'
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = 409;
        err.code = 'DUPLICATE_ACTIVE_RIDE';
        throw err;
      }
    }

    const { fares, breakdowns } = calculateFaresFromDistanceAndDuration(
      params.distanceMeters,
      params.durationSeconds
    );
    const rankings = rankCaptainsExplainably(
      this.data.captains,
      params.pickupCoords,
      params.vehicleType,
      25.0,
      params.distanceMeters,
      params.durationSeconds
    );

    if (params.preferredCaptainId) {
      const prefIdx = rankings.findIndex((c) => c.captainId === params.preferredCaptainId);
      if (prefIdx > -1) {
        const [chosen] = rankings.splice(prefIdx, 1);
        rankings.unshift(chosen);
      }
    }

    const effectiveFare = rankings[0]?.driverFare ?? fares[params.vehicleType];

    const ride: RideRecord = {
      _id: this.generateObjectId('671c'),
      user: sanitizeUser(user),
      captain: null,
      pickup: params.pickup.trim(),
      destination: params.destination.trim(),
      pickupCoords: params.pickupCoords,
      destinationCoords: params.destinationCoords,
      routeGeometry:
        params.routeGeometry && params.routeGeometry.length > 1
          ? params.routeGeometry
          : interpolateRouteGeometry(params.pickupCoords, params.destinationCoords),
      vehicleType: params.vehicleType,
      fare: effectiveFare,
      fareBreakdown: breakdowns[params.vehicleType],
      status: 'pending',
      duration: params.durationSeconds,
      distance: params.distanceMeters,
      otp: generateOtp(6),
      paymentStatus: 'pending',
      paymentMethod: 'Card',
      matchExplanation: rankings[0] || null,
      candidateRankings: rankings,
      dataSource: params.dataSource,
      createdAt: new Date().toISOString(),
    };

    this.data.rides.unshift(ride);
    this.save();
    return this.populateRide(ride);
  }

  /**
   * Atomic ride confirmation:
   * - Requires ride status === 'pending' and captain === null
   * - Prevents two captains from accepting the same ride (throws 409 Conflict)
   * - Binds the authenticated captainId
   */
  public confirmRideAtomically(rideId: string, authenticatedCaptainId: string): RideRecord {
    const ride = this.data.rides.find((r) => r._id === rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }
    const captain = this.findCaptainById(authenticatedCaptainId);
    if (!captain) {
      throw new Error('Captain not found');
    }

    if (ride.status !== 'pending' || ride.captain != null) {
      const err = new Error('Ride already accepted by another captain or no longer pending');
      (err as Error & { statusCode?: number }).statusCode = 409;
      throw err;
    }

    if (!isValidRideTransition(ride.status, 'accepted')) {
      throw new Error(`Invalid transition from ${ride.status} to accepted`);
    }

    ride.status = 'accepted';
    ride.captain = sanitizeCaptain(captain);
    ride.acceptedAt = new Date().toISOString();
    captain.metrics.assignedRides += 1;

    // Attach specific captain's explainable match breakdown if present
    const matchedCandidate = ride.candidateRankings?.find(
      (c) => c.captainId === authenticatedCaptainId
    );
    if (matchedCandidate) {
      ride.matchExplanation = matchedCandidate;
    }

    this.save();
    return this.populateRide(ride);
  }

  /**
   * Starts a ride after verifying:
   * 1) Ride exists and is in 'accepted' status
   * 2) Ride is assigned to the authenticated captainId
   * 3) Provided 6-digit OTP matches ride.otp
   */
  public startRideWithOtp(params: {
    rideId: string;
    otp: string;
    authenticatedCaptainId: string;
  }): RideRecord {
    const ride = this.data.rides.find((r) => r._id === params.rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    const assignedCaptainId =
      typeof ride.captain === 'object' && ride.captain ? ride.captain._id : ride.captain;
    if (assignedCaptainId !== params.authenticatedCaptainId) {
      const err = new Error('Unauthorized: Ride is not assigned to this captain');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }

    if (ride.status !== 'accepted') {
      throw new Error(`Ride cannot be started from status '${ride.status}'`);
    }

    if (!params.otp || ride.otp !== params.otp.trim()) {
      const err = new Error('Invalid 6-digit pickup OTP');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    ride.status = 'ongoing';
    ride.startedAt = new Date().toISOString();
    this.save();
    return this.populateRide(ride);
  }

  /**
   * Ends an ongoing ride and updates captain metrics
   */
  public endRide(params: { rideId: string; authenticatedCaptainId: string }): RideRecord {
    const ride = this.data.rides.find((r) => r._id === params.rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    const assignedCaptainId =
      typeof ride.captain === 'object' && ride.captain ? ride.captain._id : ride.captain;
    if (assignedCaptainId !== params.authenticatedCaptainId) {
      const err = new Error('Unauthorized: Ride is not assigned to this captain');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }

    if (ride.status !== 'ongoing') {
      throw new Error('Ride is not ongoing');
    }

    ride.status = 'completed';
    ride.completedAt = new Date().toISOString();

    const captain = this.findCaptainById(params.authenticatedCaptainId);
    if (captain) {
      captain.metrics.completedRides += 1;
      captain.metrics.totalEarnings = Number(
        (captain.metrics.totalEarnings + ride.fare).toFixed(2)
      );
      captain.metrics.distanceKm = Number(
        (captain.metrics.distanceKm + ride.distance / 1000).toFixed(2)
      );
      captain.location = {
        type: 'Point',
        coordinates: [ride.destinationCoords.lon, ride.destinationCoords.lat],
        updatedAt: new Date().toISOString(),
      };
      ride.captain = sanitizeCaptain(captain);
    }

    this.save();
    return this.populateRide(ride);
  }

  /**
   * Cancels a pending or accepted ride by either passenger or captain
   */
  public cancelRide(params: {
    rideId: string;
    actorRole: 'user' | 'captain';
    actorId: string;
    reason?: string;
  }): RideRecord {
    const ride = this.data.rides.find((r) => r._id === params.rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    const rideUserId = typeof ride.user === 'object' && ride.user ? ride.user._id : ride.user;
    const rideCaptainId =
      typeof ride.captain === 'object' && ride.captain ? ride.captain._id : ride.captain;

    if (params.actorRole === 'user' && rideUserId !== params.actorId) {
      const err = new Error('Unauthorized to cancel this ride');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }
    if (params.actorRole === 'captain' && rideCaptainId && rideCaptainId !== params.actorId) {
      const err = new Error('Unauthorized to cancel this ride');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }

    if (!isValidRideTransition(ride.status, 'cancelled')) {
      throw new Error(`Cannot cancel a ride in '${ride.status}' status`);
    }

    ride.status = 'cancelled';
    ride.cancelledBy = params.actorRole;
    ride.cancelReason = params.reason?.trim() || `Cancelled by ${params.actorRole}`;
    ride.cancelledAt = new Date().toISOString();
    this.save();
    return this.populateRide(ride);
  }

  public payAndRateRide(params: {
    rideId: string;
    userId: string;
    paymentMethod?: 'Cash' | 'Card' | 'Wallet';
    rating?: number;
    feedback?: string;
  }): RideRecord {
    const ride = this.data.rides.find((r) => r._id === params.rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }
    const rideUserId = typeof ride.user === 'object' && ride.user ? ride.user._id : ride.user;
    if (rideUserId !== params.userId) {
      const err = new Error('Unauthorized');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }

    ride.paymentStatus = 'paid';
    if (params.paymentMethod) {
      ride.paymentMethod = params.paymentMethod;
    }

    if (params.rating && params.rating >= 1 && params.rating <= 5) {
      ride.userRating = Math.round(params.rating);
      if (params.feedback !== undefined) {
        ride.userFeedback = params.feedback.trim();
      }
      const rideCaptainId =
        typeof ride.captain === 'object' && ride.captain ? ride.captain._id : ride.captain;
      if (rideCaptainId) {
        const cap = this.findCaptainById(rideCaptainId);
        if (cap) {
          const totalCount = Math.max(1, cap.metrics.completedRides);
          cap.metrics.rating = Number(
            (
              (cap.metrics.rating * (totalCount - 1) + ride.userRating) /
              totalCount
            ).toFixed(2)
          );
          ride.captain = sanitizeCaptain(cap);
        }
      }
    }

    this.save();
    return this.populateRide(ride);
  }

  public findRideById(rideId: string): RideRecord | undefined {
    const r = this.data.rides.find((item) => item._id === rideId);
    return r ? this.populateRide(r) : undefined;
  }

  public getActiveRideForActor(role: 'user' | 'captain', actorId: string): RideRecord | null {
    const activeStatuses = ['pending', 'accepted', 'ongoing'];
    const found = this.data.rides.find((r) => {
      if (!activeStatuses.includes(r.status)) return false;
      if (role === 'user') {
        const uid = typeof r.user === 'object' && r.user ? r.user._id : r.user;
        return uid === actorId;
      } else {
        const cid = typeof r.captain === 'object' && r.captain ? r.captain._id : r.captain;
        return cid === actorId;
      }
    });
    return found ? this.populateRide(found) : null;
  }

  public listPendingRidesForCaptain(captainId: string): RideRecord[] {
    const captain = this.findCaptainById(captainId);
    if (!captain) return [];
    return this.data.rides
      .filter((r) => r.status === 'pending' && !r.captain)
      .map((r) => this.populateRide(r));
  }

  public getRideHistoryForActor(role: 'user' | 'captain', actorId: string): RideRecord[] {
    return this.data.rides
      .filter((r) => {
        if (role === 'user') {
          const uid = typeof r.user === 'object' && r.user ? r.user._id : r.user;
          return uid === actorId;
        } else {
          const cid = typeof r.captain === 'object' && r.captain ? r.captain._id : r.captain;
          return cid === actorId;
        }
      })
      .map((r) => this.populateRide(r));
  }

  public listAllRides(): RideRecord[] {
    return this.data.rides.map((r) => this.populateRide(r));
  }

  private populateRide(ride: RideRecord): RideRecord {
    const uid = typeof ride.user === 'object' && ride.user ? ride.user._id : String(ride.user);
    const cid =
      typeof ride.captain === 'object' && ride.captain
        ? ride.captain._id
        : ride.captain
          ? String(ride.captain)
          : null;

    const u = this.findUserById(uid);
    const c = cid ? this.findCaptainById(cid) : undefined;

    return {
      ...ride,
      user: u ? sanitizeUser(u) : ride.user,
      captain: c ? sanitizeCaptain(c) : ride.captain || null,
    };
  }
}
