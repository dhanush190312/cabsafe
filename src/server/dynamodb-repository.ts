import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  DynamoDBClient,
  DescribeTableCommand,
  ConditionalCheckFailedException,
  TransactionCanceledException,
  ProvisionedThroughputExceededException,
  ResourceNotFoundException,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
} from './dynamodb-client';
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
  calculateHaversineKm,
  sanitizeUser,
  sanitizeCaptain,
} from './domain';

export interface DynamoTableConfig {
  region: string;
  endpoint?: string;
  usersTable: string;
  captainsTable: string;
  ridesTable: string;
  blacklistTable: string;
}

export interface DynamoUserItem {
  userId: string;
  email: string;
  fullname: {
    firstname: string;
    lastname: string;
  };
  phone: string;
  password?: string;
  socketId: string | null;
  rating: number;
  activeRideId: string | null;
  createdAt: string;
}

export interface DynamoCaptainItem {
  captainId: string;
  email: string;
  status: 'active' | 'inactive';
  vehicleType: VehicleType;
  fullname: {
    firstname: string;
    lastname: string;
  };
  phone: string;
  password?: string;
  socketId: string | null;
  vehicle: CaptainRecord['vehicle'];
  location: CaptainRecord['location'];
  metrics: CaptainRecord['metrics'];
  createdAt: string;
}

export interface DynamoRideItem {
  rideId: string;
  userId: string;
  captainId?: string;
  status: RideRecord['status'];
  createdAt: string;
  userSnapshot: Omit<UserRecord, 'password'>;
  captainSnapshot: Omit<CaptainRecord, 'password'> | null;
  pickup: string;
  destination: string;
  pickupCoords: Coordinates;
  destinationCoords: Coordinates;
  routeGeometry: [number, number][];
  vehicleType: VehicleType;
  fare: number;
  fareBreakdown: RideRecord['fareBreakdown'];
  duration: number;
  distance: number;
  otp: string;
  paymentStatus: RideRecord['paymentStatus'];
  paymentMethod: RideRecord['paymentMethod'];
  matchExplanation: RideRecord['matchExplanation'];
  candidateRankings?: RideRecord['candidateRankings'];
  dataSource: RideRecord['dataSource'];
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: RideRecord['cancelledBy'];
  cancelReason?: string;
  userRating?: number;
  userFeedback?: string;
}

export interface DynamoBlacklistTokenItem {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Pure item mappers between application records and DynamoDB items
 */
export function toDynamoUserItem(
  user: UserRecord,
  activeRideId: string | null = null
): DynamoUserItem {
  return {
    userId: user._id,
    email: user.email.trim().toLowerCase(),
    fullname: {
      firstname: user.fullname.firstname,
      lastname: user.fullname.lastname || '',
    },
    phone: user.phone || '+91 98400 10000',
    password: user.password,
    socketId: user.socketId ?? null,
    rating: user.rating ?? 5.0,
    activeRideId,
    createdAt: user.createdAt || new Date().toISOString(),
  };
}

export function fromDynamoUserItem(item: DynamoUserItem): UserRecord {
  return {
    _id: item.userId,
    fullname: item.fullname,
    email: item.email,
    phone: item.phone,
    password: item.password,
    socketId: item.socketId,
    rating: item.rating,
    createdAt: item.createdAt,
  };
}

export function toDynamoCaptainItem(captain: CaptainRecord): DynamoCaptainItem {
  return {
    captainId: captain._id,
    email: captain.email.trim().toLowerCase(),
    status: captain.status,
    vehicleType: captain.vehicle.vehicleType,
    fullname: {
      firstname: captain.fullname.firstname,
      lastname: captain.fullname.lastname || '',
    },
    phone: captain.phone || '+91 98400 20000',
    password: captain.password,
    socketId: captain.socketId ?? null,
    vehicle: captain.vehicle,
    location: captain.location,
    metrics: captain.metrics,
    createdAt: captain.createdAt || new Date().toISOString(),
  };
}

export function fromDynamoCaptainItem(item: DynamoCaptainItem): CaptainRecord {
  return {
    _id: item.captainId,
    fullname: item.fullname,
    email: item.email,
    phone: item.phone,
    password: item.password,
    socketId: item.socketId,
    status: item.status,
    vehicle: item.vehicle,
    location: item.location,
    metrics: item.metrics,
    createdAt: item.createdAt,
  };
}

export function toDynamoRideItem(ride: RideRecord): DynamoRideItem {
  const userObj =
    typeof ride.user === 'object' && ride.user
      ? sanitizeUser(ride.user as UserRecord)
      : ({
          _id: String(ride.user),
          fullname: { firstname: 'Passenger', lastname: '' },
          email: 'passenger@cabsafe.demo',
          socketId: null,
        } as Omit<UserRecord, 'password'>);

  const captainObj =
    typeof ride.captain === 'object' && ride.captain
      ? sanitizeCaptain(ride.captain as CaptainRecord)
      : null;

  const item: DynamoRideItem = {
    rideId: ride._id,
    userId: userObj._id,
    status: ride.status,
    createdAt: ride.createdAt || new Date().toISOString(),
    userSnapshot: userObj,
    captainSnapshot: captainObj,
    pickup: ride.pickup,
    destination: ride.destination,
    pickupCoords: ride.pickupCoords,
    destinationCoords: ride.destinationCoords,
    routeGeometry: ride.routeGeometry || [],
    vehicleType: ride.vehicleType,
    fare: ride.fare,
    fareBreakdown: ride.fareBreakdown,
    duration: ride.duration,
    distance: ride.distance,
    otp: ride.otp || '',
    paymentStatus: ride.paymentStatus,
    paymentMethod: ride.paymentMethod,
    matchExplanation: ride.matchExplanation ?? null,
    candidateRankings: ride.candidateRankings,
    dataSource: ride.dataSource,
    acceptedAt: ride.acceptedAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    cancelledAt: ride.cancelledAt,
    cancelledBy: ride.cancelledBy,
    cancelReason: ride.cancelReason,
    userRating: ride.userRating,
    userFeedback: ride.userFeedback,
  };

  if (captainObj?._id) {
    item.captainId = captainObj._id;
  }

  return item;
}

export function fromDynamoRideItem(item: DynamoRideItem): RideRecord {
  return {
    _id: item.rideId,
    user: item.userSnapshot,
    captain: item.captainSnapshot ?? null,
    pickup: item.pickup,
    destination: item.destination,
    pickupCoords: item.pickupCoords,
    destinationCoords: item.destinationCoords,
    routeGeometry: item.routeGeometry,
    vehicleType: item.vehicleType,
    fare: item.fare,
    fareBreakdown: item.fareBreakdown,
    status: item.status,
    duration: item.duration,
    distance: item.distance,
    otp: item.otp,
    paymentStatus: item.paymentStatus,
    paymentMethod: item.paymentMethod,
    matchExplanation: item.matchExplanation,
    candidateRankings: item.candidateRankings,
    dataSource: item.dataSource,
    createdAt: item.createdAt,
    acceptedAt: item.acceptedAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    cancelledAt: item.cancelledAt,
    cancelledBy: item.cancelledBy,
    cancelReason: item.cancelReason,
    userRating: item.userRating,
    userFeedback: item.userFeedback,
  };
}

export function hashJwtToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface DocClientLike {
  send(command: unknown): Promise<unknown>;
}

const JWT_SECRET = process.env.JWT_SECRET || 'cabsafe-production-jwt-secret-key-2026';

/**
 * Production Amazon DynamoDB Repository Adapter for CabSafe Chennai.
 *
 * Key architectural guarantees:
 * - Zero embedded AWS credentials (relies on EC2 IAM Instance Profile credential provider chain).
 * - Atomic ride acceptance via DynamoDB ConditionExpression (`#status = :pending AND attribute_not_exists(captainId)`).
 * - Atomic duplicate active-ride prevention via DynamoDB TransactWriteItems across Users and Rides tables.
 * - Query-only access patterns via GSIs (`EmailIndex`, `StatusVehicleIndex`, `UserRidesIndex`, `CaptainRidesIndex`, `StatusCreatedIndex`) — zero table scans.
 * - High-frequency Captain GPS write throttling to prevent DynamoDB WCU exhaustion while keeping Socket.IO live tracking instantaneous.
 */
export class DynamoDbRepository {
  public readonly config: DynamoTableConfig;
  private readonly docClient: DocClientLike;
  private readonly gpsWriteCache = new Map<
    string,
    { coords: Coordinates; persistedAtMs: number; snapshot: Omit<CaptainRecord, 'password'> }
  >();
  private readonly minGpsPersistIntervalMs: number;
  private readonly minGpsPersistDistanceMeters: number;

  constructor(options?: {
    config?: Partial<DynamoTableConfig>;
    docClient?: DocClientLike;
    minGpsPersistIntervalMs?: number;
    minGpsPersistDistanceMeters?: number;
  }) {
    this.config = {
      region: options?.config?.region || process.env.AWS_REGION || 'ap-south-1',
      endpoint: options?.config?.endpoint || process.env.DYNAMODB_ENDPOINT || undefined,
      usersTable:
        options?.config?.usersTable || process.env.DYNAMODB_USERS_TABLE || 'CabSafe-Users',
      captainsTable:
        options?.config?.captainsTable ||
        process.env.DYNAMODB_CAPTAINS_TABLE ||
        'CabSafe-Captains',
      ridesTable:
        options?.config?.ridesTable || process.env.DYNAMODB_RIDES_TABLE || 'CabSafe-Rides',
      blacklistTable:
        options?.config?.blacklistTable ||
        process.env.DYNAMODB_BLACKLIST_TABLE ||
        'CabSafe-TokenBlacklist',
    };

    this.minGpsPersistIntervalMs = options?.minGpsPersistIntervalMs ?? 10_000;
    this.minGpsPersistDistanceMeters = options?.minGpsPersistDistanceMeters ?? 25;

    if (options?.docClient) {
      this.docClient = options.docClient;
    } else {
      const baseClient = new DynamoDBClient({
        region: this.config.region,
        ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
        maxAttempts: 4, // Adaptive retry on transient throttling
      });
      this.docClient = DynamoDBDocumentClient.from(baseClient, {
        marshallOptions: {
          removeUndefinedValues: true,
        },
      });
    }
  }

  private generateObjectId(prefix = '671f'): string {
    const hex = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
    const rand = crypto.randomBytes(6).toString('hex');
    return `${prefix}${hex}${rand}`.slice(0, 24);
  }

  private wrapDynamoError(err: unknown): never {
    if (err instanceof ProvisionedThroughputExceededException) {
      const wrapped = new Error('Database temporarily throttled; please retry shortly');
      (wrapped as Error & { statusCode?: number; code?: string }).statusCode = 503;
      (wrapped as Error & { statusCode?: number; code?: string }).code = 'DYNAMODB_THROTTLED';
      throw wrapped;
    }
    if (err instanceof ResourceNotFoundException) {
      const wrapped = new Error('DynamoDB table or index not found in target AWS region');
      (wrapped as Error & { statusCode?: number; code?: string }).statusCode = 503;
      (wrapped as Error & { statusCode?: number; code?: string }).code = 'DYNAMODB_TABLE_NOT_FOUND';
      throw wrapped;
    }
    throw err;
  }

  // ---------------- Health & Readiness Check ----------------

  public async checkHealth(): Promise<{
    healthy: boolean;
    mode: 'dynamodb';
    region: string;
    table: string;
  }> {
    try {
      await this.docClient.send(
        new DescribeTableCommand({
          TableName: this.config.ridesTable,
        })
      );
      return {
        healthy: true,
        mode: 'dynamodb',
        region: this.config.region,
        table: this.config.ridesTable,
      };
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  // ---------------- JWT & Token Blacklist ----------------

  public signToken(
    id: string,
    role: 'user' | 'captain',
    expiresIn: string | number = '24h'
  ): string {
    return jwt.sign({ _id: id, role }, JWT_SECRET, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  public async verifyTokenAsync(
    token: string
  ): Promise<{ _id: string; role?: 'user' | 'captain' } | null> {
    if (!token) return null;
    const blacklisted = await this.isTokenBlacklistedAsync(token);
    if (blacklisted) return null;
    try {
      return jwt.verify(token, JWT_SECRET) as { _id: string; role?: 'user' | 'captain' };
    } catch {
      return null;
    }
  }

  public async blacklistTokenAsync(token: string): Promise<void> {
    const tokenHash = hashJwtToken(token);
    const nowMs = Date.now();
    const expiresAtSec = Math.floor(nowMs / 1000) + 24 * 60 * 60;
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.config.blacklistTable,
          Item: {
            tokenHash,
            createdAt: nowMs,
            expiresAt: expiresAtSec,
          } satisfies DynamoBlacklistTokenItem,
        })
      );
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async isTokenBlacklistedAsync(token: string): Promise<boolean> {
    const tokenHash = hashJwtToken(token);
    try {
      const res = (await this.docClient.send(
        new GetCommand({
          TableName: this.config.blacklistTable,
          Key: { tokenHash },
        })
      )) as { Item?: DynamoBlacklistTokenItem };
      if (!res.Item) return false;
      const nowSec = Math.floor(Date.now() / 1000);
      return res.Item.expiresAt > nowSec;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  // ---------------- Passenger Operations ----------------

  public async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const emailNorm = email.trim().toLowerCase();
    try {
      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.config.usersTable,
          IndexName: 'EmailIndex',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: {
            ':email': emailNorm,
          },
          Limit: 1,
        })
      )) as { Items?: DynamoUserItem[] };
      const first = res.Items?.[0];
      return first ? fromDynamoUserItem(first) : undefined;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async findUserById(userId: string): Promise<UserRecord | undefined> {
    try {
      const res = (await this.docClient.send(
        new GetCommand({
          TableName: this.config.usersTable,
          Key: { userId },
        })
      )) as { Item?: DynamoUserItem };
      return res.Item ? fromDynamoUserItem(res.Item) : undefined;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async registerUser(input: {
    firstname: string;
    lastname?: string;
    email: string;
    phone?: string;
    password: string;
  }): Promise<{ user: Omit<UserRecord, 'password'>; token: string }> {
    const emailNorm = input.email.trim().toLowerCase();
    const existing = await this.findUserByEmail(emailNorm);
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

    const item = toDynamoUserItem(newUser, null);
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.config.usersTable,
          Item: item,
          ConditionExpression: 'attribute_not_exists(userId)',
        })
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error('User already registered');
      }
      this.wrapDynamoError(err);
    }

    const token = this.signToken(newUser._id, 'user');
    return { user: sanitizeUser(newUser), token };
  }

  public async loginUser(
    email: string,
    password: string
  ): Promise<{ user: Omit<UserRecord, 'password'>; token: string }> {
    const user = await this.findUserByEmail(email);
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

  // ---------------- Captain Operations ----------------

  public async findCaptainByEmail(email: string): Promise<CaptainRecord | undefined> {
    const emailNorm = email.trim().toLowerCase();
    try {
      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.config.captainsTable,
          IndexName: 'EmailIndex',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: {
            ':email': emailNorm,
          },
          Limit: 1,
        })
      )) as { Items?: DynamoCaptainItem[] };
      const first = res.Items?.[0];
      return first ? fromDynamoCaptainItem(first) : undefined;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async findCaptainById(captainId: string): Promise<CaptainRecord | undefined> {
    try {
      const res = (await this.docClient.send(
        new GetCommand({
          TableName: this.config.captainsTable,
          Key: { captainId },
        })
      )) as { Item?: DynamoCaptainItem };
      return res.Item ? fromDynamoCaptainItem(res.Item) : undefined;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async listActiveCaptains(vehicleType?: VehicleType): Promise<CaptainRecord[]> {
    try {
      const keyCondition = vehicleType
        ? '#status = :active AND vehicleType = :vt'
        : '#status = :active';
      const exprValues: Record<string, unknown> = { ':active': 'active' };
      if (vehicleType) {
        exprValues[':vt'] = vehicleType;
      }

      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.config.captainsTable,
          IndexName: 'StatusVehicleIndex',
          KeyConditionExpression: keyCondition,
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: exprValues,
        })
      )) as { Items?: DynamoCaptainItem[] };
      return (res.Items || []).map(fromDynamoCaptainItem);
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

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
    const existing = await this.findCaptainByEmail(emailNorm);
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

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.config.captainsTable,
          Item: toDynamoCaptainItem(newCaptain),
          ConditionExpression: 'attribute_not_exists(captainId)',
        })
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error('Captain already exist');
      }
      this.wrapDynamoError(err);
    }

    const token = this.signToken(newCaptain._id, 'captain');
    return { captain: sanitizeCaptain(newCaptain), token };
  }

  public async loginCaptain(
    email: string,
    password: string
  ): Promise<{ captain: Omit<CaptainRecord, 'password'>; token: string }> {
    const captain = await this.findCaptainByEmail(email);
    if (!captain || !captain.password) {
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, captain.password);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    await this.updateCaptainStatus(captain._id, 'active');
    captain.status = 'active';
    const token = this.signToken(captain._id, 'captain');
    return { captain: sanitizeCaptain(captain), token };
  }

  public async updateCaptainStatus(
    captainId: string,
    status: 'active' | 'inactive'
  ): Promise<Omit<CaptainRecord, 'password'>> {
    try {
      const res = (await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.captainsTable,
          Key: { captainId },
          UpdateExpression: 'SET #status = :status',
          ConditionExpression: 'attribute_exists(captainId)',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': status,
          },
          ReturnValues: 'ALL_NEW',
        })
      )) as { Attributes?: DynamoCaptainItem };
      if (!res.Attributes) throw new Error('Captain not found');
      return sanitizeCaptain(fromDynamoCaptainItem(res.Attributes));
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error('Captain not found');
      }
      this.wrapDynamoError(err);
    }
  }

  /**
   * Updates an authenticated captain's live coordinates.
   * Enforces Chennai boundary validation and applies GPS write throttling to avoid
   * unnecessary DynamoDB writes on high-frequency Socket.IO location events.
   */
  public async updateCaptainLocation(
    captainId: string,
    coords: Coordinates,
    options?: { forcePersist?: boolean }
  ): Promise<{
    captain: Omit<CaptainRecord, 'password'>;
    persistedToDynamo: boolean;
  }> {
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

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const normalizedCoords: Coordinates = {
      lon: Number(coords.lon.toFixed(6)),
      lat: Number(coords.lat.toFixed(6)),
    };

    const cached = this.gpsWriteCache.get(captainId);
    if (cached && !options?.forcePersist) {
      const elapsedMs = nowMs - cached.persistedAtMs;
      const movedMeters = calculateHaversineKm(cached.coords, normalizedCoords) * 1000;
      if (
        elapsedMs < this.minGpsPersistIntervalMs &&
        movedMeters < this.minGpsPersistDistanceMeters
      ) {
        const updatedSnapshot: Omit<CaptainRecord, 'password'> = {
          ...cached.snapshot,
          location: {
            type: 'Point',
            coordinates: [normalizedCoords.lon, normalizedCoords.lat],
            updatedAt: nowIso,
          },
        };
        return {
          captain: updatedSnapshot,
          persistedToDynamo: false,
        };
      }
    }

    try {
      const res = (await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.captainsTable,
          Key: { captainId },
          UpdateExpression: 'SET #location = :loc',
          ConditionExpression: 'attribute_exists(captainId)',
          ExpressionAttributeNames: {
            '#location': 'location',
          },
          ExpressionAttributeValues: {
            ':loc': {
              type: 'Point',
              coordinates: [normalizedCoords.lon, normalizedCoords.lat],
              updatedAt: nowIso,
            },
          },
          ReturnValues: 'ALL_NEW',
        })
      )) as { Attributes?: DynamoCaptainItem };

      if (!res.Attributes) {
        throw new Error('Captain not found');
      }
      const sanitized = sanitizeCaptain(fromDynamoCaptainItem(res.Attributes));
      this.gpsWriteCache.set(captainId, {
        coords: normalizedCoords,
        persistedAtMs: nowMs,
        snapshot: sanitized,
      });
      return {
        captain: sanitized,
        persistedToDynamo: true,
      };
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error('Captain not found');
      }
      this.wrapDynamoError(err);
    }
  }

  // ---------------- Ride Lifecycle Operations (Atomic & Transactional) ----------------

  public async createRide(params: {
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
    preferredCaptainId?: string;
  }): Promise<RideRecord> {
    const endpointValidation = validateChennaiTripEndpoints(
      params.pickupCoords,
      params.destinationCoords
    );
    if (!endpointValidation.valid) {
      const err = new Error(
        endpointValidation.message || 'Trip endpoints are outside the Chennai service area'
      );
      (err as Error & { statusCode?: number; code?: string }).statusCode = 422;
      (err as Error & { statusCode?: number; code?: string }).code =
        endpointValidation.code || 'OUTSIDE_SERVICE_AREA';
      throw err;
    }

    const user = await this.findUserById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { fares, breakdowns } = calculateFaresFromDistanceAndDuration(
      params.distanceMeters,
      params.durationSeconds
    );
    const activeCaptains = await this.listActiveCaptains(params.vehicleType);
    const rankings = rankCaptainsExplainably(
      activeCaptains,
      params.pickupCoords,
      params.vehicleType
    );

    if (params.preferredCaptainId) {
      const prefIdx = rankings.findIndex((c) => c.captainId === params.preferredCaptainId);
      if (prefIdx > -1) {
        const [chosen] = rankings.splice(prefIdx, 1);
        rankings.unshift(chosen);
      }
    }

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
      fare: fares[params.vehicleType],
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

    const rideItem = toDynamoRideItem(ride);

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.config.usersTable,
                Key: { userId: params.userId },
                UpdateExpression: 'SET activeRideId = :rideId',
                ConditionExpression:
                  'attribute_exists(userId) AND (attribute_not_exists(activeRideId) OR activeRideId = :null)',
                ExpressionAttributeValues: {
                  ':rideId': ride._id,
                  ':null': null,
                },
              },
            },
            {
              Put: {
                TableName: this.config.ridesTable,
                Item: rideItem,
                ConditionExpression: 'attribute_not_exists(rideId)',
              },
            },
          ],
        })
      );
      return ride;
    } catch (err) {
      if (
        err instanceof TransactionCanceledException ||
        err instanceof ConditionalCheckFailedException
      ) {
        const conflict = new Error(
          'Passenger already has an active ride in progress. Complete or cancel it before booking another.'
        );
        (conflict as Error & { statusCode?: number; code?: string }).statusCode = 409;
        (conflict as Error & { statusCode?: number; code?: string }).code = 'ACTIVE_RIDE_EXISTS';
        throw conflict;
      }
      this.wrapDynamoError(err);
    }
  }

  /**
   * Atomic ride acceptance in DynamoDB:
   * Enforces `#status = :pending AND attribute_not_exists(captainId)` at the storage layer
   * so two captains on different EC2 instances can never claim the same pending ride.
   */
  public async confirmRideAtomically(
    rideId: string,
    authenticatedCaptainId: string
  ): Promise<RideRecord> {
    const captain = await this.findCaptainById(authenticatedCaptainId);
    if (!captain) {
      throw new Error('Captain not found');
    }

    const existingRide = await this.findRideById(rideId);
    if (!existingRide) {
      throw new Error('Ride not found');
    }

    const matchedCandidate =
      existingRide.candidateRankings?.find((c) => c.captainId === authenticatedCaptainId) ||
      existingRide.matchExplanation ||
      null;

    const acceptedAt = new Date().toISOString();
    const captainSnapshot = sanitizeCaptain(captain);

    try {
      const res = (await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.ridesTable,
          Key: { rideId },
          UpdateExpression:
            'SET #status = :accepted, captainId = :captainId, captainSnapshot = :captainSnapshot, acceptedAt = :acceptedAt, matchExplanation = :matchExplanation',
          ConditionExpression:
            'attribute_exists(rideId) AND #status = :pending AND attribute_not_exists(captainId)',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':pending': 'pending',
            ':accepted': 'accepted',
            ':captainId': authenticatedCaptainId,
            ':captainSnapshot': captainSnapshot,
            ':acceptedAt': acceptedAt,
            ':matchExplanation': matchedCandidate,
          },
          ReturnValues: 'ALL_NEW',
        })
      )) as { Attributes?: DynamoRideItem };

      if (!res.Attributes) {
        throw new Error('Ride not found');
      }
      return fromDynamoRideItem(res.Attributes);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        const conflict = new Error('Ride already accepted by another captain or no longer pending');
        (conflict as Error & { statusCode?: number; code?: string }).statusCode = 409;
        (conflict as Error & { statusCode?: number; code?: string }).code = 'RIDE_ALREADY_CLAIMED';
        throw conflict;
      }
      this.wrapDynamoError(err);
    }
  }

  /**
   * Starts a ride only after verifying captain ownership, 'accepted' status, and 6-digit OTP
   * both in application logic and via DynamoDB ConditionExpression.
   */
  public async startRideWithOtp(params: {
    rideId: string;
    otp: string;
    authenticatedCaptainId: string;
  }): Promise<RideRecord> {
    const ride = await this.findRideById(params.rideId);
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

    const cleanOtp = params.otp?.trim() || '';
    if (!cleanOtp || ride.otp !== cleanOtp) {
      const err = new Error('Invalid 6-digit pickup OTP');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    const startedAt = new Date().toISOString();
    try {
      const res = (await this.docClient.send(
        new UpdateCommand({
          TableName: this.config.ridesTable,
          Key: { rideId: params.rideId },
          UpdateExpression: 'SET #status = :ongoing, startedAt = :startedAt',
          ConditionExpression:
            'attribute_exists(rideId) AND #status = :accepted AND captainId = :captainId AND otp = :otp',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':accepted': 'accepted',
            ':ongoing': 'ongoing',
            ':captainId': params.authenticatedCaptainId,
            ':otp': cleanOtp,
            ':startedAt': startedAt,
          },
          ReturnValues: 'ALL_NEW',
        })
      )) as { Attributes?: DynamoRideItem };

      if (!res.Attributes) {
        throw new Error('Ride not found');
      }
      return fromDynamoRideItem(res.Attributes);
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        const conflict = new Error('Invalid OTP or ride state changed concurrently');
        (conflict as Error & { statusCode?: number }).statusCode = 409;
        throw conflict;
      }
      this.wrapDynamoError(err);
    }
  }

  public async endRide(params: {
    rideId: string;
    authenticatedCaptainId: string;
  }): Promise<RideRecord> {
    const ride = await this.findRideById(params.rideId);
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

    const userId = typeof ride.user === 'object' && ride.user ? ride.user._id : String(ride.user);
    const completedAt = new Date().toISOString();

    const captain = await this.findCaptainById(params.authenticatedCaptainId);
    const updatedMetrics = captain
      ? {
          ...captain.metrics,
          completedRides: captain.metrics.completedRides + 1,
          totalEarnings: Number((captain.metrics.totalEarnings + ride.fare).toFixed(2)),
          distanceKm: Number((captain.metrics.distanceKm + ride.distance / 1000).toFixed(2)),
        }
      : undefined;

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.config.ridesTable,
                Key: { rideId: params.rideId },
                UpdateExpression: 'SET #status = :completed, completedAt = :completedAt',
                ConditionExpression:
                  'attribute_exists(rideId) AND #status = :ongoing AND captainId = :captainId',
                ExpressionAttributeNames: {
                  '#status': 'status',
                },
                ExpressionAttributeValues: {
                  ':ongoing': 'ongoing',
                  ':completed': 'completed',
                  ':captainId': params.authenticatedCaptainId,
                  ':completedAt': completedAt,
                },
              },
            },
            {
              Update: {
                TableName: this.config.usersTable,
                Key: { userId },
                UpdateExpression: 'SET activeRideId = :null',
                ExpressionAttributeValues: {
                  ':null': null,
                },
              },
            },
            ...(updatedMetrics
              ? [
                  {
                    Update: {
                      TableName: this.config.captainsTable,
                      Key: { captainId: params.authenticatedCaptainId },
                      UpdateExpression: 'SET metrics = :metrics, #location = :loc',
                      ExpressionAttributeNames: {
                        '#location': 'location',
                      },
                      ExpressionAttributeValues: {
                        ':metrics': updatedMetrics,
                        ':loc': {
                          type: 'Point',
                          coordinates: [ride.destinationCoords.lon, ride.destinationCoords.lat],
                          updatedAt: completedAt,
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        })
      );

      const updatedRide = await this.findRideById(params.rideId);
      if (!updatedRide) throw new Error('Ride not found after completion');
      return updatedRide;
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        const conflict = new Error('Ride state changed concurrently and could not be completed');
        (conflict as Error & { statusCode?: number }).statusCode = 409;
        throw conflict;
      }
      this.wrapDynamoError(err);
    }
  }

  public async cancelRide(params: {
    rideId: string;
    actorRole: 'user' | 'captain';
    actorId: string;
    reason?: string;
  }): Promise<RideRecord> {
    const ride = await this.findRideById(params.rideId);
    if (!ride) {
      throw new Error('Ride not found');
    }

    const rideUserId =
      typeof ride.user === 'object' && ride.user ? ride.user._id : String(ride.user);
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

    const cancelledAt = new Date().toISOString();
    const cancelReason = params.reason?.trim() || `Cancelled by ${params.actorRole}`;

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.config.ridesTable,
                Key: { rideId: params.rideId },
                UpdateExpression:
                  'SET #status = :cancelled, cancelledBy = :by, cancelReason = :reason, cancelledAt = :at',
                ConditionExpression:
                  'attribute_exists(rideId) AND (#status = :pending OR #status = :accepted)',
                ExpressionAttributeNames: {
                  '#status': 'status',
                },
                ExpressionAttributeValues: {
                  ':pending': 'pending',
                  ':accepted': 'accepted',
                  ':cancelled': 'cancelled',
                  ':by': params.actorRole,
                  ':reason': cancelReason,
                  ':at': cancelledAt,
                },
              },
            },
            {
              Update: {
                TableName: this.config.usersTable,
                Key: { userId: rideUserId },
                UpdateExpression: 'SET activeRideId = :null',
                ExpressionAttributeValues: {
                  ':null': null,
                },
              },
            },
          ],
        })
      );

      const updated = await this.findRideById(params.rideId);
      if (!updated) throw new Error('Ride not found');
      return updated;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async findRideById(rideId: string): Promise<RideRecord | undefined> {
    try {
      const res = (await this.docClient.send(
        new GetCommand({
          TableName: this.config.ridesTable,
          Key: { rideId },
        })
      )) as { Item?: DynamoRideItem };
      return res.Item ? fromDynamoRideItem(res.Item) : undefined;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async getActiveRideForActor(
    role: 'user' | 'captain',
    actorId: string
  ): Promise<RideRecord | null> {
    try {
      const indexName = role === 'user' ? 'UserRidesIndex' : 'CaptainRidesIndex';
      const pkAttr = role === 'user' ? 'userId' : 'captainId';

      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.config.ridesTable,
          IndexName: indexName,
          KeyConditionExpression: `${pkAttr} = :actorId`,
          FilterExpression: '#status IN (:pending, :accepted, :ongoing)',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':actorId': actorId,
            ':pending': 'pending',
            ':accepted': 'accepted',
            ':ongoing': 'ongoing',
          },
          ScanIndexForward: false,
        })
      )) as { Items?: DynamoRideItem[] };

      const activeItem = res.Items?.[0];
      return activeItem ? fromDynamoRideItem(activeItem) : null;
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async listPendingRidesForCaptain(captainId: string): Promise<RideRecord[]> {
    const captain = await this.findCaptainById(captainId);
    if (!captain) return [];
    try {
      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.config.ridesTable,
          IndexName: 'StatusCreatedIndex',
          KeyConditionExpression: '#status = :pending',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':pending': 'pending',
          },
          ScanIndexForward: false,
        })
      )) as { Items?: DynamoRideItem[] };

      return (res.Items || []).map(fromDynamoRideItem);
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }

  public async getRideHistoryForActor(
    role: 'user' | 'captain',
    actorId: string
  ): Promise<RideRecord[]> {
    try {
      const indexName = role === 'user' ? 'UserRidesIndex' : 'CaptainRidesIndex';
      const pkAttr = role === 'user' ? 'userId' : 'captainId';

      const res = (await this.docClient.send(
        new QueryCommand({
          TableName: this.config.ridesTable,
          IndexName: indexName,
          KeyConditionExpression: `${pkAttr} = :actorId`,
          ExpressionAttributeValues: {
            ':actorId': actorId,
          },
          ScanIndexForward: false,
        })
      )) as { Items?: DynamoRideItem[] };

      return (res.Items || []).map(fromDynamoRideItem);
    } catch (err) {
      this.wrapDynamoError(err);
    }
  }
}
