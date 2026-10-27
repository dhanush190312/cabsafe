import fs from 'fs';
import path from 'path';
import { PutCommand, GetCommand } from './dynamodb-client';
import { DatabaseSchema } from './repository';
import {
  DocClientLike,
  DynamoTableConfig,
  toDynamoUserItem,
  toDynamoCaptainItem,
  toDynamoRideItem,
  hashJwtToken,
  DynamoUserItem,
  DynamoCaptainItem,
  DynamoRideItem,
} from './dynamodb-repository';
import { isPointInChennaiServiceArea } from './domain';

export interface MigrationReport {
  sourcePath: string;
  dryRun: boolean;
  counts: {
    usersMigrated: number;
    captainsMigrated: number;
    ridesMigrated: number;
    tokensMigrated: number;
  };
  verification: {
    verifiedUsers: number;
    verifiedCaptains: number;
    verifiedRides: number;
    allChennaiBoundsValid: boolean;
    allInrFaresValid: boolean;
    passed: boolean;
  };
}

/**
 * Safely migrates records from the local JSON persistence file (.data/cabsafe-db.json)
 * into Amazon DynamoDB tables without deleting or mutating the local JSON database.
 */
export async function migrateJsonStoreToDynamoDb(options: {
  docClient: DocClientLike;
  tableConfig: DynamoTableConfig;
  sourceFilePath?: string;
  sourceSchema?: DatabaseSchema;
  dryRun?: boolean;
}): Promise<MigrationReport> {
  const sourcePath =
    options.sourceFilePath ||
    process.env.DATA_FILE_PATH ||
    path.resolve(process.cwd(), '.data', 'cabsafe-db.json');

  const dryRun = Boolean(options.dryRun);

  let schema: DatabaseSchema;
  if (options.sourceSchema) {
    schema = options.sourceSchema;
  } else {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Migration source file does not exist at ${sourcePath}`);
    }
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    schema = JSON.parse(raw) as DatabaseSchema;
  }

  const activeStatuses = new Set(['pending', 'accepted', 'ongoing']);

  let usersMigrated = 0;
  let captainsMigrated = 0;
  let ridesMigrated = 0;
  let tokensMigrated = 0;

  // 1. Migrate Users (preserving activeRideId if user currently has an active ride)
  for (const user of schema.users || []) {
    const activeRide = (schema.rides || []).find((r) => {
      if (!activeStatuses.has(r.status)) return false;
      const uid = typeof r.user === 'object' && r.user ? r.user._id : String(r.user);
      return uid === user._id;
    });
    const item = toDynamoUserItem(user, activeRide ? activeRide._id : null);
    if (!dryRun) {
      await options.docClient.send(
        new PutCommand({
          TableName: options.tableConfig.usersTable,
          Item: item,
        })
      );
    }
    usersMigrated += 1;
  }

  // 2. Migrate Captains
  for (const captain of schema.captains || []) {
    const item = toDynamoCaptainItem(captain);
    if (!dryRun) {
      await options.docClient.send(
        new PutCommand({
          TableName: options.tableConfig.captainsTable,
          Item: item,
        })
      );
    }
    captainsMigrated += 1;
  }

  // 3. Migrate Rides
  for (const ride of schema.rides || []) {
    const item = toDynamoRideItem(ride);
    if (!dryRun) {
      await options.docClient.send(
        new PutCommand({
          TableName: options.tableConfig.ridesTable,
          Item: item,
        })
      );
    }
    ridesMigrated += 1;
  }

  // 4. Migrate Blacklisted Tokens
  for (const entry of schema.blacklistTokens || []) {
    const tokenHash = hashJwtToken(entry.token);
    const expiresAt = Math.floor(entry.createdAt / 1000) + 24 * 60 * 60;
    if (!dryRun) {
      await options.docClient.send(
        new PutCommand({
          TableName: options.tableConfig.blacklistTable,
          Item: {
            tokenHash,
            createdAt: entry.createdAt,
            expiresAt,
          },
        })
      );
    }
    tokensMigrated += 1;
  }

  // 5. Post-Migration Verification
  let verifiedUsers = 0;
  let verifiedCaptains = 0;
  let verifiedRides = 0;
  let allChennaiBoundsValid = true;
  let allInrFaresValid = true;

  if (!dryRun) {
    for (const user of schema.users || []) {
      const res = (await options.docClient.send(
        new GetCommand({
          TableName: options.tableConfig.usersTable,
          Key: { userId: user._id },
        })
      )) as { Item?: DynamoUserItem };
      if (res.Item && res.Item.email === user.email.toLowerCase()) {
        verifiedUsers += 1;
      }
    }

    for (const captain of schema.captains || []) {
      const res = (await options.docClient.send(
        new GetCommand({
          TableName: options.tableConfig.captainsTable,
          Key: { captainId: captain._id },
        })
      )) as { Item?: DynamoCaptainItem };
      if (res.Item && res.Item.captainId === captain._id) {
        verifiedCaptains += 1;
        const [lon, lat] = res.Item.location.coordinates;
        if (!isPointInChennaiServiceArea({ lat, lon })) {
          allChennaiBoundsValid = false;
        }
      }
    }

    for (const ride of schema.rides || []) {
      const res = (await options.docClient.send(
        new GetCommand({
          TableName: options.tableConfig.ridesTable,
          Key: { rideId: ride._id },
        })
      )) as { Item?: DynamoRideItem };
      if (res.Item && res.Item.rideId === ride._id) {
        verifiedRides += 1;
        if (res.Item.fare < 25) {
          allInrFaresValid = false;
        }
        if (
          !isPointInChennaiServiceArea(res.Item.pickupCoords) ||
          !isPointInChennaiServiceArea(res.Item.destinationCoords)
        ) {
          allChennaiBoundsValid = false;
        }
      }
    }
  } else {
    verifiedUsers = usersMigrated;
    verifiedCaptains = captainsMigrated;
    verifiedRides = ridesMigrated;
  }

  const passed =
    verifiedUsers === usersMigrated &&
    verifiedCaptains === captainsMigrated &&
    verifiedRides === ridesMigrated &&
    allChennaiBoundsValid &&
    allInrFaresValid;

  return {
    sourcePath,
    dryRun,
    counts: {
      usersMigrated,
      captainsMigrated,
      ridesMigrated,
      tokensMigrated,
    },
    verification: {
      verifiedUsers,
      verifiedCaptains,
      verifiedRides,
      allChennaiBoundsValid,
      allInrFaresValid,
      passed,
    },
  };
}
