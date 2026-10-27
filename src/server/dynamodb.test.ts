import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DescribeTableCommand,
  ConditionalCheckFailedException,
  TransactionCanceledException,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
  marshallMap,
  unmarshallMap,
} from './dynamodb-client';
import {
  DynamoDbRepository,
  DocClientLike,
  DynamoTableConfig,
} from './dynamodb-repository';
import { migrateJsonStoreToDynamoDb } from './migrate-to-dynamodb';
import { CabSafeRepository } from './repository';
import { URBAN_LANDMARKS, OUTSIDE_CHENNAI_REFERENCE_LOCATIONS } from './domain';

/**
 * Spec-compliant DynamoDB DocumentClient Simulator for deterministic offline testing
 * of AWS SDK v3 Command objects, GSIs, ConditionExpressions, and TransactWriteItems.
 */
class SpecCompliantDynamoDocClientStub implements DocClientLike {
  public tables = new Map<string, Map<string, Record<string, unknown>>>();
  public commandLog: { name: string; table?: string }[] = [];

  private getTable(tableName: string): Map<string, Record<string, unknown>> {
    let t = this.tables.get(tableName);
    if (!t) {
      t = new Map();
      this.tables.set(tableName, t);
    }
    return t;
  }

  private getPrimaryKeyAttr(tableName: string): string {
    if (tableName.endsWith('Users')) return 'userId';
    if (tableName.endsWith('Captains')) return 'captainId';
    if (tableName.endsWith('Rides')) return 'rideId';
    if (tableName.endsWith('TokenBlacklist')) return 'tokenHash';
    return 'id';
  }

  private throwConditionalFailed(message = 'The conditional request failed'): never {
    throw new ConditionalCheckFailedException({
      message,
      $metadata: {},
    });
  }

  private evaluateCondition(
    condition: string | undefined,
    existing: Record<string, unknown> | undefined,
    names?: Record<string, string>,
    values?: Record<string, unknown>
  ): void {
    if (!condition) return;

    const statusField = names?.['#status'] || 'status';

    if (condition === 'attribute_not_exists(userId)' && existing) {
      this.throwConditionalFailed('userId already exists');
    }
    if (condition === 'attribute_not_exists(captainId)' && existing) {
      this.throwConditionalFailed('captainId already exists');
    }
    if (condition === 'attribute_not_exists(rideId)' && existing) {
      this.throwConditionalFailed('rideId already exists');
    }
    if (condition === 'attribute_exists(captainId)' && !existing) {
      this.throwConditionalFailed('captainId does not exist');
    }
    if (
      condition ===
      'attribute_exists(userId) AND (attribute_not_exists(activeRideId) OR activeRideId = :null)'
    ) {
      if (!existing) this.throwConditionalFailed('User does not exist');
      if (existing.activeRideId !== undefined && existing.activeRideId !== null) {
        this.throwConditionalFailed('User already has an activeRideId');
      }
    }
    if (
      condition ===
      'attribute_exists(rideId) AND #status = :pending AND attribute_not_exists(captainId)'
    ) {
      if (!existing) this.throwConditionalFailed('Ride does not exist');
      if (
        existing[statusField] !== values?.[':pending'] ||
        (existing.captainId !== undefined && existing.captainId !== null)
      ) {
        this.throwConditionalFailed('Ride already claimed or not pending');
      }
    }
    if (
      condition ===
      'attribute_exists(rideId) AND #status = :accepted AND captainId = :captainId AND otp = :otp'
    ) {
      if (!existing) this.throwConditionalFailed('Ride does not exist');
      if (
        existing[statusField] !== values?.[':accepted'] ||
        existing.captainId !== values?.[':captainId'] ||
        existing.otp !== values?.[':otp']
      ) {
        this.throwConditionalFailed('OTP or status condition failed');
      }
    }
    if (
      condition ===
      'attribute_exists(rideId) AND #status = :ongoing AND captainId = :captainId'
    ) {
      if (!existing) this.throwConditionalFailed('Ride does not exist');
      if (
        existing[statusField] !== values?.[':ongoing'] ||
        existing.captainId !== values?.[':captainId']
      ) {
        this.throwConditionalFailed('Ride not ongoing or captain mismatch');
      }
    }
  }

  private applyUpdate(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    conditionExpression?: string,
    names?: Record<string, string>,
    values?: Record<string, unknown>
  ): Record<string, unknown> {
    const pkAttr = this.getPrimaryKeyAttr(tableName);
    const pkVal = String(key[pkAttr]);
    const table = this.getTable(tableName);
    const existing = table.get(pkVal);

    this.evaluateCondition(conditionExpression, existing, names, values);
    if (!existing) {
      this.throwConditionalFailed('Target item not found for update');
    }

    const updated = { ...existing };
    const cleanExpr = updateExpression.replace(/^SET\s+/i, '');
    const assignments = cleanExpr.split(',').map((part) => part.trim());

    for (const assign of assignments) {
      const [rawField, rawValKey] = assign.split('=').map((s) => s.trim());
      const fieldName = names?.[rawField] || rawField;
      const val = values?.[rawValKey];
      updated[fieldName] = val;
    }

    table.set(pkVal, updated);
    return updated;
  }

  public async send(command: unknown): Promise<unknown> {
    if (command instanceof DescribeTableCommand) {
      this.commandLog.push({ name: 'DescribeTableCommand', table: command.input.TableName });
      return {
        Table: {
          TableName: command.input.TableName,
          TableStatus: 'ACTIVE',
        },
      };
    }

    if (command instanceof GetCommand) {
      const tableName = command.input.TableName!;
      this.commandLog.push({ name: 'GetCommand', table: tableName });
      const pkAttr = this.getPrimaryKeyAttr(tableName);
      const pkVal = String(command.input.Key![pkAttr]);
      const item = this.getTable(tableName).get(pkVal);
      return { Item: item ? structuredClone(item) : undefined };
    }

    if (command instanceof PutCommand) {
      const tableName = command.input.TableName!;
      this.commandLog.push({ name: 'PutCommand', table: tableName });
      const pkAttr = this.getPrimaryKeyAttr(tableName);
      const item = command.input.Item as Record<string, unknown>;
      const pkVal = String(item[pkAttr]);
      const table = this.getTable(tableName);
      const existing = table.get(pkVal);

      this.evaluateCondition(
        command.input.ConditionExpression,
        existing,
        command.input.ExpressionAttributeNames,
        command.input.ExpressionAttributeValues
      );

      table.set(pkVal, structuredClone(item));
      return {};
    }

    if (command instanceof UpdateCommand) {
      const tableName = command.input.TableName!;
      this.commandLog.push({ name: 'UpdateCommand', table: tableName });
      const updated = this.applyUpdate(
        tableName,
        command.input.Key as Record<string, unknown>,
        command.input.UpdateExpression!,
        command.input.ConditionExpression,
        command.input.ExpressionAttributeNames,
        command.input.ExpressionAttributeValues
      );
      return { Attributes: structuredClone(updated) };
    }

    if (command instanceof TransactWriteCommand) {
      this.commandLog.push({ name: 'TransactWriteCommand' });
      const items = command.input.TransactItems || [];

      // Phase 1: Validate all conditions atomically before mutating
      for (const txItem of items) {
        if (txItem.Update) {
          const tName = txItem.Update.TableName!;
          const pkAttr = this.getPrimaryKeyAttr(tName);
          const pkVal = String((txItem.Update.Key as Record<string, unknown>)[pkAttr]);
          const existing = this.getTable(tName).get(pkVal);
          try {
            this.evaluateCondition(
              txItem.Update.ConditionExpression,
              existing,
              txItem.Update.ExpressionAttributeNames,
              txItem.Update.ExpressionAttributeValues
            );
          } catch {
            throw new TransactionCanceledException({
              message: 'Transaction cancelled due to conditional check failure',
              $metadata: {},
            });
          }
        }
        if (txItem.Put) {
          const tName = txItem.Put.TableName!;
          const pkAttr = this.getPrimaryKeyAttr(tName);
          const itemObj = txItem.Put.Item as Record<string, unknown>;
          const pkVal = String(itemObj[pkAttr]);
          const existing = this.getTable(tName).get(pkVal);
          try {
            this.evaluateCondition(
              txItem.Put.ConditionExpression,
              existing,
              txItem.Put.ExpressionAttributeNames,
              txItem.Put.ExpressionAttributeValues
            );
          } catch {
            throw new TransactionCanceledException({
              message: 'Transaction cancelled due to conditional check failure',
              $metadata: {},
            });
          }
        }
      }

      // Phase 2: Commit all mutations
      for (const txItem of items) {
        if (txItem.Update) {
          this.applyUpdate(
            txItem.Update.TableName!,
            txItem.Update.Key as Record<string, unknown>,
            txItem.Update.UpdateExpression!,
            undefined,
            txItem.Update.ExpressionAttributeNames,
            txItem.Update.ExpressionAttributeValues
          );
        }
        if (txItem.Put) {
          const tName = txItem.Put.TableName!;
          const pkAttr = this.getPrimaryKeyAttr(tName);
          const itemObj = txItem.Put.Item as Record<string, unknown>;
          const pkVal = String(itemObj[pkAttr]);
          this.getTable(tName).set(pkVal, structuredClone(itemObj));
        }
      }
      return {};
    }

    if (command instanceof QueryCommand) {
      const tableName = command.input.TableName!;
      const indexName = command.input.IndexName;
      this.commandLog.push({ name: 'QueryCommand', table: `${tableName}:${indexName}` });
      const allItems = Array.from(this.getTable(tableName).values());
      const vals = command.input.ExpressionAttributeValues || {};

      let matched = allItems.filter((item) => {
        if (indexName === 'EmailIndex') {
          return item.email === vals[':email'];
        }
        if (indexName === 'StatusVehicleIndex') {
          const statusMatch = item.status === vals[':active'];
          const vtMatch = vals[':vt'] ? item.vehicleType === vals[':vt'] : true;
          return statusMatch && vtMatch;
        }
        if (indexName === 'UserRidesIndex') {
          return item.userId === vals[':actorId'];
        }
        if (indexName === 'CaptainRidesIndex') {
          return item.captainId === vals[':actorId'];
        }
        if (indexName === 'StatusCreatedIndex') {
          return item.status === vals[':pending'];
        }
        return false;
      });

      if (command.input.FilterExpression?.includes('#status IN (:pending, :accepted, :ongoing)')) {
        matched = matched.filter((item) =>
          ['pending', 'accepted', 'ongoing'].includes(String(item.status))
        );
      }

      matched.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );

      return { Items: matched.map((i) => structuredClone(i)) };
    }

    throw new Error(`Unsupported command in test stub: ${command}`);
  }
}

test('Stage C.1: DynamoDbRepository Health, Auth, EmailIndex GSI & Token Blacklist TTL', async () => {
  const docStub = new SpecCompliantDynamoDocClientStub();
  const repo = new DynamoDbRepository({ docClient: docStub });

  const health = await repo.checkHealth();
  assert.equal(health.healthy, true);
  assert.equal(health.mode, 'dynamodb');

  // Register passenger
  const regUser = await repo.registerUser({
    firstname: 'Karthik',
    lastname: 'Subramanian',
    email: 'Karthik.S@CabSafe.in',
    phone: '+91 98401 11223',
    password: 'securePassword123',
  });
  assert.equal(regUser.user.email, 'karthik.s@cabsafe.in');
  assert.ok(regUser.token);

  // Duplicate email blocked via EmailIndex GSI
  await assert.rejects(
    () =>
      repo.registerUser({
        firstname: 'Karthik',
        email: 'karthik.s@cabsafe.in',
        password: 'securePassword123',
      }),
    /User already registered/
  );

  // Verify token & blacklist TTL
  const decoded = await repo.verifyTokenAsync(regUser.token);
  assert.equal(decoded?._id, regUser.user._id);

  await repo.blacklistTokenAsync(regUser.token);
  const afterBlacklist = await repo.verifyTokenAsync(regUser.token);
  assert.equal(afterBlacklist, null);
});

test('Stage C.2: DynamoDbRepository Atomic Ride Creation, Duplicate Guard (409), Concurrent Acceptance Race (409) & OTP Trip Lifecycle', async () => {
  const docStub = new SpecCompliantDynamoDocClientStub();
  const repo = new DynamoDbRepository({
    docClient: docStub,
    minGpsPersistIntervalMs: 10_000,
    minGpsPersistDistanceMeters: 25,
  });

  const passenger = await repo.registerUser({
    firstname: 'Divya',
    lastname: 'Natarajan',
    email: 'divya.n@cabsafe.in',
    password: 'password123',
  });

  const captain1 = await repo.registerCaptain({
    fullname: { firstname: 'Murugan', lastname: 'K' },
    email: 'murugan.captain@cabsafe.in',
    password: 'password123',
    vehicle: {
      color: 'White',
      plate: 'TN-01-AB-1234',
      capacity: 4,
      vehicleType: 'car',
      model: 'Maruti Swift Dzire',
    },
  });

  const captain2 = await repo.registerCaptain({
    fullname: { firstname: 'Senthil', lastname: 'V' },
    email: 'senthil.captain@cabsafe.in',
    password: 'password123',
    vehicle: {
      color: 'Silver',
      plate: 'TN-09-CD-5678',
      capacity: 4,
      vehicleType: 'car',
      model: 'Hyundai Aura',
    },
  });

  const tNagar = URBAN_LANDMARKS[2]; // T. Nagar
  const annaNagar = URBAN_LANDMARKS[3]; // Anna Nagar
  const kanchipuram = OUTSIDE_CHENNAI_REFERENCE_LOCATIONS[0];

  // Out-of-area booking must be rejected with 422 before hitting DynamoDB
  await assert.rejects(
    async () => {
      await repo.createRide({
        userId: passenger.user._id,
        pickup: tNagar.name,
        destination: kanchipuram.name,
        pickupCoords: { lat: tNagar.lat, lon: tNagar.lon },
        destinationCoords: { lat: kanchipuram.lat, lon: kanchipuram.lon },
        vehicleType: 'car',
        distanceMeters: 72000,
        durationSeconds: 5400,
        dataSource: 'fallback_geodata',
      });
    },
    (err: Error & { statusCode?: number }) => err.statusCode === 422
  );

  // Valid Chennai ride creation via TransactWriteCommand
  const createdRide = await repo.createRide({
    userId: passenger.user._id,
    pickup: tNagar.name,
    destination: annaNagar.name,
    pickupCoords: { lat: tNagar.lat, lon: tNagar.lon },
    destinationCoords: { lat: annaNagar.lat, lon: annaNagar.lon },
    vehicleType: 'car',
    distanceMeters: 6800,
    durationSeconds: 1140,
    dataSource: 'live_osm',
  });

  assert.equal(createdRide.status, 'pending');
  const rideOtp = String(createdRide.otp || '');
  assert.equal(rideOtp.length, 6);
  assert.ok(createdRide.fare >= 50);

  // Duplicate active ride request by the same passenger must fail atomically with 409
  await assert.rejects(
    async () => {
      await repo.createRide({
        userId: passenger.user._id,
        pickup: tNagar.name,
        destination: annaNagar.name,
        pickupCoords: { lat: tNagar.lat, lon: tNagar.lon },
        destinationCoords: { lat: annaNagar.lat, lon: annaNagar.lon },
        vehicleType: 'car',
        distanceMeters: 6800,
        durationSeconds: 1140,
        dataSource: 'live_osm',
      });
    },
    (err: Error & { statusCode?: number; code?: string }) =>
      err.statusCode === 409 && err.code === 'ACTIVE_RIDE_EXISTS'
  );

  // Atomic ride acceptance: Captain 1 claims the ride
  const acceptedRide = await repo.confirmRideAtomically(createdRide._id, captain1.captain._id);
  assert.equal(acceptedRide.status, 'accepted');
  assert.equal(
    typeof acceptedRide.captain === 'object' && acceptedRide.captain?._id,
    captain1.captain._id
  );

  // Concurrent acceptance attempt by Captain 2 (on another EC2 instance) MUST fail with 409 Conflict
  await assert.rejects(
    async () => {
      await repo.confirmRideAtomically(createdRide._id, captain2.captain._id);
    },
    (err: Error & { statusCode?: number; code?: string }) =>
      err.statusCode === 409 && err.code === 'RIDE_ALREADY_CLAIMED'
  );

  // Unauthorized captain (Captain 2) attempting to start ride must be rejected with 403
  await assert.rejects(
    async () => {
      await repo.startRideWithOtp({
        rideId: createdRide._id,
        otp: rideOtp,
        authenticatedCaptainId: captain2.captain._id,
      });
    },
    (err: Error & { statusCode?: number }) => err.statusCode === 403
  );

  // Wrong OTP must be rejected with 400
  await assert.rejects(
    async () => {
      await repo.startRideWithOtp({
        rideId: createdRide._id,
        otp: '000000',
        authenticatedCaptainId: captain1.captain._id,
      });
    },
    (err: Error & { statusCode?: number }) => err.statusCode === 400
  );

  // Valid 6-digit OTP transitions ride to 'ongoing'
  const ongoingRide = await repo.startRideWithOtp({
    rideId: createdRide._id,
    otp: rideOtp,
    authenticatedCaptainId: captain1.captain._id,
  });
  assert.equal(ongoingRide.status, 'ongoing');

  // High-frequency GPS throttling check
  const firstLoc = await repo.updateCaptainLocation(captain1.captain._id, {
    lat: 13.0418,
    lon: 80.2341,
  });
  assert.equal(firstLoc.persistedToDynamo, true);

  // Second GPS event 2 meters away within 10s is throttled from DynamoDB write
  const secondLoc = await repo.updateCaptainLocation(captain1.captain._id, {
    lat: 13.04181,
    lon: 80.23411,
  });
  assert.equal(secondLoc.persistedToDynamo, false);

  // Complete trip via TransactWriteCommand
  const completedRide = await repo.endRide({
    rideId: createdRide._id,
    authenticatedCaptainId: captain1.captain._id,
  });
  assert.equal(completedRide.status, 'completed');

  // Verify active ride is cleared so passenger can book a new ride
  const activeAfterComplete = await repo.getActiveRideForActor('user', passenger.user._id);
  assert.equal(activeAfterComplete, null);
});

test('Stage C.3: Non-Destructive JSON-to-DynamoDB Migration & Verification', async () => {
  const fileRepo = new CabSafeRepository({ persist: false });
  const docStub = new SpecCompliantDynamoDocClientStub();
  const tableConfig: DynamoTableConfig = {
    region: 'ap-south-1',
    usersTable: 'CabSafe-Users',
    captainsTable: 'CabSafe-Captains',
    ridesTable: 'CabSafe-Rides',
    blacklistTable: 'CabSafe-TokenBlacklist',
  };

  const report = await migrateJsonStoreToDynamoDb({
    docClient: docStub,
    tableConfig,
    sourceSchema: {
      users: [fileRepo.findUserById('671a00000000000000000001')!],
      captains: fileRepo.listCaptains() as never,
      rides: fileRepo.listAllRides(),
      blacklistTokens: [],
    },
  });

  assert.equal(report.verification.passed, true);
  assert.equal(report.verification.allChennaiBoundsValid, true);
  assert.equal(report.verification.allInrFaresValid, true);
  assert.ok(report.counts.usersMigrated >= 1);
  assert.ok(report.counts.captainsMigrated >= 1);
  assert.ok(report.counts.ridesMigrated >= 1);
});
