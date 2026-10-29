import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  VehicleType,
  Coordinates,
  URBAN_LANDMARKS,
  OUTSIDE_CHENNAI_REFERENCE_LOCATIONS,
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  CHENNAI_SERVICE_AREA_METADATA,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
  isValidCoordinatePair,
  calculateFaresFromDistanceAndDuration,
  rankCaptainsExplainably,
  sanitizeUser,
  sanitizeCaptain,
  sanitizeRideForRole,
} from './src/server/domain';
import { CabSafeRepository } from './src/server/repository';
import { DynamoDbRepository } from './src/server/dynamodb-repository';
import {
  resolveAddressCoordinate,
  resolveDistanceAndTime,
  reverseGeocodeCoordinate,
  getAutocompleteSuggestions,
} from './src/server/geo';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const PERSISTENCE_MODE = (process.env.PERSISTENCE_MODE || 'file') as 'file' | 'dynamodb';
const repo = new CabSafeRepository();
const dynamoRepo = PERSISTENCE_MODE === 'dynamodb' ? new DynamoDbRepository() : null;
let isDraining = false;

interface AuthenticatedRequest extends Request {
  user?: ReturnType<typeof sanitizeUser>;
  captain?: ReturnType<typeof sanitizeCaptain>;
  token?: string;
}

function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.token;
  const headerAuth = req.headers.authorization;
  if (headerAuth && headerAuth.startsWith('Bearer ')) {
    return headerAuth.split(' ')[1];
  }
  return cookieToken;
}

const authUser = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    return;
  }
  const decoded = repo.verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    return;
  }
  const user = repo.findUserById(decoded._id);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: User not found' });
    return;
  }
  req.user = sanitizeUser(user);
  req.token = token;
  next();
};

const authCaptain = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized captain: Missing authentication token' });
    return;
  }
  const decoded = repo.verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Unauthorized captain: Invalid or expired token' });
    return;
  }
  const captain = repo.findCaptainById(decoded._id);
  if (!captain) {
    res.status(401).json({ error: 'Unauthorized: Captain not found' });
    return;
  }
  req.captain = sanitizeCaptain(captain);
  req.token = token;
  next();
};

/**
 * Allows either an authenticated User or Captain to call map/geocoding routes
 */
const authAny = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }
  const decoded = repo.verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }
  const user = repo.findUserById(decoded._id);
  if (user) {
    req.user = sanitizeUser(user);
    req.token = token;
    next();
    return;
  }
  const captain = repo.findCaptainById(decoded._id);
  if (captain) {
    req.captain = sanitizeCaptain(captain);
    req.token = token;
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ---------------- Socket.IO Initialization ----------------
  const io = new SocketIOServer(server, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 25000,
    pingInterval: 20000,
  });

  function sendMessageToSocketId(
    socketId: string | null | undefined,
    payload: { event: string; data: unknown }
  ) {
    if (!socketId) return;
    io.to(socketId).emit(payload.event, payload.data);
  }

  io.on('connection', (socket) => {
    const handleJoin = (
      payload: { userId?: string; userType?: 'user' | 'captain'; token?: string } = {},
      ack?: (res: { ok: boolean; error?: string; authenticatedSession?: boolean }) => void
    ) => {
      try {
        const { userId, userType, token } = payload;
        if (!userId || !userType || !['user', 'captain'].includes(userType)) {
          ack?.({ ok: false, error: 'userId and valid userType required' });
          return;
        }
        // Distinguish a raw socket connection from an authenticated ride session
        if (token) {
          const decoded = repo.verifyToken(token);
          if (!decoded || decoded._id !== userId) {
            ack?.({ ok: false, error: 'Unauthorized socket join: invalid token' });
            return;
          }
          socket.data.authenticated = true;
        } else {
          socket.data.authenticated = false;
        }
        repo.bindSocket(userType, userId, socket.id);
        socket.data.userId = userId;
        socket.data.userType = userType;
        socket.join(`${userType}:${userId}`);
        ack?.({ ok: true, authenticatedSession: Boolean(socket.data.authenticated) });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message || 'join failed' });
      }
    };

    socket.on('join', handleJoin);
    socket.on('user-join', (p, ack) => handleJoin({ ...p, userType: 'user' }, ack));
    socket.on('captain-join', (p, ack) => handleJoin({ ...p, userType: 'captain' }, ack));

    const handleUpdateLoc = (
      payload: {
        userId?: string;
        location?: { lat?: number; lon?: number; ltd?: number; lng?: number };
        token?: string;
      } = {},
      ack?: (res: { ok: boolean; error?: string; code?: string }) => void
    ) => {
      try {
        const captainId = payload.userId || socket.data.userId;
        const lat = Number(payload.location?.lat ?? payload.location?.ltd);
        const lon = Number(payload.location?.lon ?? payload.location?.lng);

        if (!captainId || Number.isNaN(lat) || Number.isNaN(lon)) {
          ack?.({ ok: false, error: 'Invalid location payload' });
          return;
        }

        // Enforce captain authentication & ownership for location updates
        if (payload.token) {
          const decoded = repo.verifyToken(payload.token);
          if (!decoded || decoded._id !== captainId || decoded.role === 'user') {
            ack?.({ ok: false, error: 'Unauthorized location update', code: 'UNAUTHORIZED' });
            return;
          }
        } else if (
          !socket.data.userId ||
          socket.data.userId !== captainId ||
          socket.data.userType !== 'captain'
        ) {
          ack?.({
            ok: false,
            error: 'Socket session is not authorized as this captain',
            code: 'UNAUTHORIZED',
          });
          return;
        }

        const updatedCaptain = repo.updateCaptainLocation(captainId, { lat, lon });

        // Relay live location ONLY during eligible active ride states ('accepted' or 'ongoing')
        const activeRide = repo.getActiveRideForActor('captain', captainId);
        if (
          activeRide &&
          ['accepted', 'ongoing'].includes(activeRide.status) &&
          typeof activeRide.user === 'object' &&
          activeRide.user
        ) {
          const locationEvent = {
            rideId: activeRide._id,
            captainId,
            location: { lat, lon },
            updatedAt: updatedCaptain.location.updatedAt || new Date().toISOString(),
            captain: updatedCaptain,
          };
          sendMessageToSocketId(activeRide.user.socketId, {
            event: 'captain-location-updated',
            data: locationEvent,
          });
          io.to(`user:${activeRide.user._id}`).emit('captain-location-updated', locationEvent);
        }
        io.emit('fleet-location-updated', {
          captainId,
          location: { lat, lon },
          updatedAt: updatedCaptain.location.updatedAt,
        });
        ack?.({ ok: true });
      } catch (e) {
        const err = e as Error & { code?: string };
        ack?.({ ok: false, error: err.message || 'update failed', code: err.code });
      }
    };

    socket.on('update-location-captain', handleUpdateLoc);
    socket.on('update-location', handleUpdateLoc);

    socket.on('disconnect', () => {
      repo.clearSocket(socket.id);
    });
  });

  // ---------------- Health & Metadata Routes ----------------
  const apiRouter = express.Router();

  apiRouter.get('/api/checkhealth', async (_req, res) => {
    if (isDraining) {
      res.status(503).send('draining');
      return;
    }
    if (dynamoRepo) {
      try {
        await dynamoRepo.checkHealth();
      } catch {
        res.status(503).send('unhealthy: dynamodb unreachable');
        return;
      }
    }
    res.status(200).send('ok');
  });

  apiRouter.get('/api/health', async (_req, res) => {
    if (isDraining) {
      res.status(503).json({
        status: 'draining',
        persistenceMode: PERSISTENCE_MODE,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (dynamoRepo) {
      try {
        const dbHealth = await dynamoRepo.checkHealth();
        res.status(200).json({
          status: 'healthy',
          persistenceMode: 'dynamodb',
          dynamodb: dbHealth,
          operatingArea: 'Chennai, Tamil Nadu, India',
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        });
        return;
      } catch (err) {
        res.status(503).json({
          status: 'unhealthy',
          persistenceMode: 'dynamodb',
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }
    res.status(200).json({
      status: 'healthy',
      persistenceMode: 'file',
      awsRegion: process.env.AWS_REGION || 'ap-south-1',
      operatingArea: 'Chennai, Tamil Nadu, India',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // ---------------- User Routes (/users/*) ----------------
  apiRouter.post('/users/register', async (req: Request, res: Response) => {
    try {
      const { fullname, email, password, phone } = req.body || {};
      const firstname = fullname?.firstname?.trim();
      const lastname = fullname?.lastname?.trim() || '';
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        res.status(400).json({ errors: [{ msg: 'Invalid email', path: 'email' }] });
        return;
      }
      if (!firstname || firstname.length < 3) {
        res.status(400).json({
          errors: [
            {
              msg: 'First name must be at least 3 characters long',
              path: 'fullname.firstname',
            },
          ],
        });
        return;
      }
      if (!password || String(password).length < 6) {
        res.status(400).json({
          errors: [{ msg: 'Password must be at least 6 characters long', path: 'password' }],
        });
        return;
      }

      const result = await repo.registerUser({
        firstname,
        lastname,
        email,
        phone,
        password: String(password),
      });
      res.cookie('token', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  apiRouter.post('/users/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }
      const result = await repo.loginUser(String(email), String(password));
      res.cookie('token', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  apiRouter.get('/users/profile', authUser, (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json(req.user);
  });

  apiRouter.put('/users/profile', authUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { firstname, lastname, phone } = req.body || {};
      if (firstname !== undefined && String(firstname).trim().length < 3) {
        res.status(400).json({ error: 'First name must be at least 3 characters long' });
        return;
      }
      const updated = repo.updateUserProfile(req.user!._id, {
        firstname,
        lastname,
        phone,
      });
      res.status(200).json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const handleUserLogout = (req: AuthenticatedRequest, res: Response) => {
    if (req.token) {
      repo.blacklistToken(req.token);
    }
    res.clearCookie('token');
    res.status(200).json({ message: 'Logged out successfully' });
  };

  apiRouter.post('/users/logout', authUser, handleUserLogout);
  apiRouter.get('/users/logout', authUser, handleUserLogout);

  // ---------------- Captain Routes (/captains/*) ----------------
  apiRouter.post('/captains/register', async (req: Request, res: Response) => {
    try {
      const { fullname, email, password, phone, vehicle } = req.body || {};
      const firstname = fullname?.firstname?.trim();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        res.status(400).json({ errors: [{ msg: 'Invalid email', path: 'email' }] });
        return;
      }
      if (!firstname || firstname.length < 3) {
        res.status(400).json({
          errors: [
            {
              msg: 'First name must be at least 3 characters long',
              path: 'fullname.firstname',
            },
          ],
        });
        return;
      }
      if (!password || String(password).length < 6) {
        res.status(400).json({
          errors: [{ msg: 'Password must be at least 6 characters long', path: 'password' }],
        });
        return;
      }
      if (!vehicle?.color || String(vehicle.color).trim().length < 3) {
        res.status(400).json({
          errors: [{ msg: 'Color must be at least 3 characters long', path: 'vehicle.color' }],
        });
        return;
      }
      if (!vehicle?.plate || String(vehicle.plate).trim().length < 3) {
        res.status(400).json({
          errors: [{ msg: 'Plate must be at least 3 characters long', path: 'vehicle.plate' }],
        });
        return;
      }
      if (!vehicle?.capacity || Number(vehicle.capacity) < 1) {
        res.status(400).json({
          errors: [{ msg: 'Capacity must be at least 1 person', path: 'vehicle.capacity' }],
        });
        return;
      }
      if (!['car', 'cng', 'motorcycle'].includes(vehicle?.vehicleType)) {
        res.status(400).json({
          errors: [{ msg: 'Invalid vehicle type', path: 'vehicle.vehicleType' }],
        });
        return;
      }

      const result = await repo.registerCaptain({
        fullname: { firstname, lastname: fullname?.lastname?.trim() || '' },
        email,
        phone,
        password: String(password),
        vehicle: {
          color: vehicle.color,
          plate: vehicle.plate,
          capacity: Number(vehicle.capacity),
          vehicleType: vehicle.vehicleType as VehicleType,
          model: vehicle.model,
        },
      });
      res.cookie('token', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message, error: (err as Error).message });
    }
  });

  apiRouter.post('/captains/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }
      const result = await repo.loginCaptain(String(email), String(password));
      res.cookie('token', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  apiRouter.get('/captains/profile', authCaptain, (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json(req.captain);
  });

  apiRouter.put('/captains/profile', authCaptain, (req: AuthenticatedRequest, res: Response) => {
    try {
      const updated = repo.updateCaptainProfile(req.captain!._id, req.body || {});
      res.status(200).json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  apiRouter.patch('/captains/status', authCaptain, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body || {};
      if (status !== 'active' && status !== 'inactive') {
        res.status(400).json({ error: "Status must be 'active' or 'inactive'" });
        return;
      }
      const updated = repo.updateCaptainStatus(req.captain!._id, status);
      io.emit('captain-status-changed', updated);
      res.status(200).json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /**
   * Authenticated HTTP endpoint for Captain location updates (validates Chennai service boundary)
   */
  apiRouter.post('/captains/location', authCaptain, (req: AuthenticatedRequest, res: Response) => {
    try {
      const lat = Number(req.body?.lat ?? req.body?.location?.lat);
      const lon = Number(req.body?.lon ?? req.body?.location?.lon);
      const updatedCaptain = repo.updateCaptainLocation(req.captain!._id, { lat, lon });

      const activeRide = repo.getActiveRideForActor('captain', req.captain!._id);
      if (
        activeRide &&
        ['accepted', 'ongoing'].includes(activeRide.status) &&
        typeof activeRide.user === 'object' &&
        activeRide.user
      ) {
        const locPayload = {
          rideId: activeRide._id,
          captainId: req.captain!._id,
          location: { lat, lon },
          updatedAt: updatedCaptain.location.updatedAt || new Date().toISOString(),
          captain: updatedCaptain,
        };
        sendMessageToSocketId(activeRide.user.socketId, {
          event: 'captain-location-updated',
          data: locPayload,
        });
        io.to(`user:${activeRide.user._id}`).emit('captain-location-updated', locPayload);
      }

      res.status(200).json(updatedCaptain);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
      const code = (err as Error & { code?: string }).code;
      res.status(statusCode).json({
        error: (err as Error).message,
        message: (err as Error).message,
        code,
      });
    }
  });

  const handleCaptainLogout = (req: AuthenticatedRequest, res: Response) => {
    if (req.token) {
      repo.blacklistToken(req.token);
    }
    if (req.captain?._id) {
      repo.updateCaptainStatus(req.captain._id, 'inactive');
    }
    res.clearCookie('token');
    res.status(200).json({ message: 'Logged out successfully' });
  };

  apiRouter.post('/captains/logout', authCaptain, handleCaptainLogout);
  apiRouter.get('/captains/logout', authCaptain, handleCaptainLogout);

  // ---------------- Maps & Chennai Service-Area Routes (/maps/*) ----------------
  apiRouter.get('/maps/service-area', (_req: Request, res: Response) => {
    res.status(200).json({
      mapConfig: CHENNAI_MAP_CONFIG,
      metadata: CHENNAI_SERVICE_AREA_METADATA,
      polygon: CHENNAI_PROVISIONAL_POLYGON,
      landmarks: URBAN_LANDMARKS,
      outsideReferenceLocations: OUTSIDE_CHENNAI_REFERENCE_LOCATIONS,
    });
  });

  apiRouter.get('/maps/landmarks', (_req: Request, res: Response) => {
    res.status(200).json(URBAN_LANDMARKS);
  });

  apiRouter.get('/maps/reverse-geocode', authAny, async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!isValidCoordinatePair({ lat, lon })) {
      res.status(400).json({ message: 'Valid lat and lon query parameters are required' });
      return;
    }
    try {
      const result = await reverseGeocodeCoordinate({ lat, lon });
      res.status(200).json(result);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  apiRouter.get('/maps/get-coordinates', authAny, async (req: Request, res: Response) => {
    const address = String(req.query.address || '').trim();
    if (address.length < 2) {
      res.status(400).json({ errors: [{ msg: 'Address must be at least 2 characters' }] });
      return;
    }
    try {
      const { coords, source, inServiceArea } = await resolveAddressCoordinate(address);
      res.status(200).json({
        ...coords,
        source,
        inServiceArea,
        boundaryStatus: CHENNAI_SERVICE_AREA_METADATA.status,
      });
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 404;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
        code: (err as Error & { code?: string }).code || 'ADDRESS_NOT_FOUND',
      });
    }
  });

  apiRouter.get('/maps/get-distance-time', authAny, async (req: Request, res: Response) => {
    const origin = String(req.query.origin || '').trim();
    const destination = String(req.query.destination || '').trim();
    if (!origin || !destination) {
      res.status(400).json({ message: 'Origin and destination are required' });
      return;
    }
    try {
      const result = await resolveDistanceAndTime(origin, destination);
      res.status(200).json(result);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 404;
      const code = (err as Error & { code?: string }).code;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
        code,
      });
    }
  });

  apiRouter.get('/maps/get-suggestions', authAny, async (req: Request, res: Response) => {
    const input = String(req.query.input || '').trim();
    try {
      const suggestions = await getAutocompleteSuggestions(input);
      res.status(200).json(suggestions);
    } catch {
      res.status(500).json({ message: 'Suggestions not found' });
    }
  });

  // ---------------- Ride Routes (/rides/*) ----------------
  apiRouter.get('/rides/get-fare', authAny, async (req: Request, res: Response) => {
    const pickup = String(req.query.pickup || '').trim();
    const destination = String(req.query.destination || '').trim();
    if (pickup.length < 2 || destination.length < 2) {
      res.status(400).json({ message: 'Valid pickup and destination are required' });
      return;
    }

    const pickupLat = req.query.pickupLat ? Number(req.query.pickupLat) : undefined;
    const pickupLon = req.query.pickupLon ? Number(req.query.pickupLon) : undefined;
    const destLat = req.query.destLat ? Number(req.query.destLat) : undefined;
    const destLon = req.query.destLon ? Number(req.query.destLon) : undefined;

    const explicitOrigin: Coordinates | null =
      pickupLat !== undefined && pickupLon !== undefined && !Number.isNaN(pickupLat) && !Number.isNaN(pickupLon)
        ? { lat: pickupLat, lon: pickupLon }
        : null;
    const explicitDest: Coordinates | null =
      destLat !== undefined && destLon !== undefined && !Number.isNaN(destLat) && !Number.isNaN(destLon)
        ? { lat: destLat, lon: destLon }
        : null;

    try {
      const routeData = await resolveDistanceAndTime(
        pickup,
        destination,
        explicitOrigin,
        explicitDest
      );
      const { fares, breakdowns } = calculateFaresFromDistanceAndDuration(
        routeData.distance.value,
        routeData.duration.value
      );
      const reqVehicle = (req.query.vehicleType as VehicleType) || undefined;
      const candidateRankings = rankCaptainsExplainably(
        repo.listCaptains(),
        routeData.originCoords,
        reqVehicle,
        25.0,
        routeData.distance.value,
        routeData.duration.value
      );
      res.status(200).json({
        ...fares,
        fares,
        breakdowns,
        distance: routeData.distance,
        duration: routeData.duration,
        originCoords: routeData.originCoords,
        destinationCoords: routeData.destinationCoords,
        routeGeometry: routeData.routeGeometry,
        dataSource: routeData.source,
        candidateRankings,
        serviceAreaStatus: CHENNAI_SERVICE_AREA_METADATA.status,
      });
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 422;
      const code = (err as Error & { code?: string }).code;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
        code,
        originCoords: (err as { originCoords?: Coordinates }).originCoords,
        destinationCoords: (err as { destinationCoords?: Coordinates }).destinationCoords,
      });
    }
  });

  apiRouter.post('/rides/create', authUser, async (req: AuthenticatedRequest, res: Response) => {
    const { pickup, destination, vehicleType, pickupCoords, destinationCoords, preferredCaptainId } = req.body || {};
    if (
      !pickup ||
      String(pickup).trim().length < 2 ||
      !destination ||
      String(destination).trim().length < 2 ||
      !['car', 'cng', 'motorcycle'].includes(vehicleType)
    ) {
      res.status(400).json({
        message: 'Valid pickup, destination, and vehicleType (car, cng, motorcycle) are required',
      });
      return;
    }

    try {
      const routeData = await resolveDistanceAndTime(
        String(pickup),
        String(destination),
        pickupCoords,
        destinationCoords
      );
      const ride = repo.createRide({
        userId: req.user!._id,
        pickup: String(pickup),
        destination: String(destination),
        pickupCoords: routeData.originCoords,
        destinationCoords: routeData.destinationCoords,
        vehicleType: vehicleType as VehicleType,
        distanceMeters: routeData.distance.value,
        durationSeconds: routeData.duration.value,
        routeGeometry: routeData.routeGeometry,
        dataSource: routeData.source,
        preferredCaptainId: preferredCaptainId ? String(preferredCaptainId) : undefined,
      });

      const userSafeRide = sanitizeRideForRole(ride, 'user');
      res.status(201).json(userSafeRide);

      // Broadcast sanitized ride (without OTP!) to ranked nearby captains
      const captainSafeRide = sanitizeRideForRole(ride, 'captain');
      const rankedCaptains = ride.candidateRankings || [];
      for (const candidate of rankedCaptains) {
        const cap = repo.findCaptainById(candidate.captainId);
        if (cap?.socketId) {
          sendMessageToSocketId(cap.socketId, {
            event: 'new-ride',
            data: { ...captainSafeRide, matchExplanation: candidate },
          });
        }
        io.to(`captain:${candidate.captainId}`).emit('new-ride', {
          ...captainSafeRide,
          matchExplanation: candidate,
        });
      }
      io.emit('ride-dispatched', captainSafeRide);
    } catch (err) {
      if (!res.headersSent) {
        const statusCode = (err as Error & { statusCode?: number }).statusCode || 422;
        const code = (err as Error & { code?: string }).code;
        res.status(statusCode).json({
          message: (err as Error).message,
          error: (err as Error).message,
          code,
        });
      }
    }
  });

  apiRouter.post('/rides/confirm', authCaptain, (req: AuthenticatedRequest, res: Response) => {
    const { rideId } = req.body || {};
    if (!rideId) {
      res.status(400).json({ message: 'rideId is required' });
      return;
    }

    try {
      const ride = repo.confirmRideAtomically(String(rideId), req.captain!._id);

      const userPayload = sanitizeRideForRole(ride, 'user');
      const captainPayload = sanitizeRideForRole(ride, 'captain');

      if (typeof ride.user === 'object' && ride.user) {
        sendMessageToSocketId(ride.user.socketId, {
          event: 'ride-confirmed',
          data: userPayload,
        });
        io.to(`user:${ride.user._id}`).emit('ride-confirmed', userPayload);
      }
      io.emit('ride-updated', captainPayload);

      res.status(200).json(captainPayload);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
      });
    }
  });

  const handleStartRide = (req: AuthenticatedRequest, res: Response) => {
    const rideId = String(req.body?.rideId || req.query?.rideId || '').trim();
    const otp = String(req.body?.otp || req.query?.otp || '').trim();

    if (!rideId || otp.length !== 6) {
      res.status(400).json({ message: 'Valid rideId and 6-digit OTP are required' });
      return;
    }

    try {
      const ride = repo.startRideWithOtp({
        rideId,
        otp,
        authenticatedCaptainId: req.captain!._id,
      });

      const userPayload = sanitizeRideForRole(ride, 'user');
      const captainPayload = sanitizeRideForRole(ride, 'captain');

      if (typeof ride.user === 'object' && ride.user) {
        sendMessageToSocketId(ride.user.socketId, {
          event: 'ride-started',
          data: userPayload,
        });
        io.to(`user:${ride.user._id}`).emit('ride-started', userPayload);
      }
      io.emit('ride-updated', captainPayload);

      res.status(200).json(captainPayload);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
      });
    }
  };

  apiRouter.post('/rides/start-ride', authCaptain, handleStartRide);
  apiRouter.get('/rides/start-ride', authCaptain, handleStartRide);

  apiRouter.post('/rides/end-ride', authCaptain, (req: AuthenticatedRequest, res: Response) => {
    const { rideId } = req.body || {};
    if (!rideId) {
      res.status(400).json({ message: 'rideId is required' });
      return;
    }

    try {
      const ride = repo.endRide({
        rideId: String(rideId),
        authenticatedCaptainId: req.captain!._id,
      });

      const userPayload = sanitizeRideForRole(ride, 'user');
      const captainPayload = sanitizeRideForRole(ride, 'captain');

      if (typeof ride.user === 'object' && ride.user) {
        sendMessageToSocketId(ride.user.socketId, {
          event: 'ride-ended',
          data: userPayload,
        });
        io.to(`user:${ride.user._id}`).emit('ride-ended', userPayload);
      }
      io.emit('ride-updated', captainPayload);

      res.status(200).json(captainPayload);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
      });
    }
  });

  apiRouter.post('/rides/cancel', authAny, (req: AuthenticatedRequest, res: Response) => {
    const { rideId, reason } = req.body || {};
    if (!rideId) {
      res.status(400).json({ message: 'rideId is required' });
      return;
    }

    try {
      const actorRole = req.captain ? 'captain' : 'user';
      const actorId = req.captain ? req.captain._id : req.user!._id;
      const ride = repo.cancelRide({
        rideId: String(rideId),
        actorRole,
        actorId,
        reason,
      });

      const safeForCaptain = sanitizeRideForRole(ride, 'captain');
      if (typeof ride.user === 'object' && ride.user) {
        sendMessageToSocketId(ride.user.socketId, {
          event: 'ride-cancelled',
          data: sanitizeRideForRole(ride, 'user'),
        });
        io.to(`user:${ride.user._id}`).emit('ride-cancelled', sanitizeRideForRole(ride, 'user'));
      }
      if (typeof ride.captain === 'object' && ride.captain) {
        sendMessageToSocketId(ride.captain.socketId, {
          event: 'ride-cancelled',
          data: safeForCaptain,
        });
        io.to(`captain:${ride.captain._id}`).emit('ride-cancelled', safeForCaptain);
      }
      io.emit('ride-updated', safeForCaptain);

      res.status(200).json(
        actorRole === 'user' ? sanitizeRideForRole(ride, 'user') : safeForCaptain
      );
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(statusCode).json({
        message: (err as Error).message,
        error: (err as Error).message,
      });
    }
  });

  apiRouter.get('/rides/active', authAny, (req: AuthenticatedRequest, res: Response) => {
    const role = req.captain ? 'captain' : 'user';
    const actorId = req.captain ? req.captain._id : req.user!._id;
    const active = repo.getActiveRideForActor(role, actorId);
    if (!active) {
      res.status(200).json({
        ride: null,
        pendingOffers:
          role === 'captain'
            ? repo
                .listPendingRidesForCaptain(actorId)
                .map((r) => sanitizeRideForRole(r, 'captain'))
            : [],
      });
      return;
    }
    res.status(200).json({
      ride: sanitizeRideForRole(active, role),
      pendingOffers: [],
    });
  });

  apiRouter.get('/rides/history', authAny, (req: AuthenticatedRequest, res: Response) => {
    const role = req.captain ? 'captain' : 'user';
    const actorId = req.captain ? req.captain._id : req.user!._id;
    const history = repo
      .getRideHistoryForActor(role, actorId)
      .map((r) => sanitizeRideForRole(r, role));
    res.status(200).json(history);
  });

  apiRouter.post('/rides/pay', authUser, (req: AuthenticatedRequest, res: Response) => {
    const { rideId, paymentMethod, rating, feedback } = req.body || {};
    if (!rideId) {
      res.status(400).json({ message: 'rideId is required' });
      return;
    }
    try {
      const updated = repo.payAndRateRide({
        rideId: String(rideId),
        userId: req.user!._id,
        paymentMethod,
        rating: rating ? Number(rating) : undefined,
        feedback,
      });
      const safe = sanitizeRideForRole(updated, 'user');
      io.emit('ride-updated', sanitizeRideForRole(updated, 'captain'));
      res.status(200).json(safe);
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
      res.status(statusCode).json({ message: (err as Error).message });
    }
  });

  // ---------------- Admin & Clearly Labelled Simulation Endpoints ----------------
  apiRouter.get('/admin/overview', (_req: Request, res: Response) => {
    const captains = repo.listCaptains();
    const rides = repo.listAllRides();
    res.status(200).json({
      captains,
      rides,
      serviceArea: {
        mapConfig: CHENNAI_MAP_CONFIG,
        metadata: CHENNAI_SERVICE_AREA_METADATA,
        polygon: CHENNAI_PROVISIONAL_POLYGON,
      },
      stats: {
        totalCaptains: captains.length,
        activeCaptains: captains.filter((c) => c.status === 'active').length,
        totalRides: rides.length,
        activeRides: rides.filter((r) =>
          ['pending', 'accepted', 'ongoing'].includes(r.status)
        ).length,
        completedRides: rides.filter((r) => r.status === 'completed').length,
        currency: 'INR',
        totalVolumeInr: Number(
          rides
            .filter((r) => r.status === 'completed')
            .reduce((sum, r) => sum + r.fare, 0)
            .toFixed(2)
        ),
        totalVolumeUsd: Number(
          rides
            .filter((r) => r.status === 'completed')
            .reduce((sum, r) => sum + r.fare, 0)
            .toFixed(2)
        ),
      },
    });
  });

  /**
   * [SIMULATION] Allows single-browser evaluators to trigger top-matched captain acceptance,
   * OTP start, or GPS route stepping in Chennai without needing a second physical device.
   */
  apiRouter.post('/admin/simulate-action', (req: Request, res: Response) => {
    try {
      const { action, rideId, captainId } = req.body || {};
      const rides = repo.listAllRides();
      const targetRide = rideId
        ? repo.findRideById(String(rideId))
        : rides.find((r) => ['pending', 'accepted', 'ongoing'].includes(r.status));

      if (action === 'reset-demo') {
        repo.seedDefaultsSync();
        io.emit('demo-reset', {});
        res.status(200).json({
          message: '[SIMULATION] Demo state reset to clean Chennai seed data.',
        });
        return;
      }

      if (action === 'spawn-demo-ride') {
        const created = repo.createRide({
          userId: '671a00000000000000000001',
          pickup: 'T. Nagar, Panagal Park, Thyagaraya Nagar, Chennai, Tamil Nadu',
          destination: 'Velachery Main Road, Phoenix Marketcity, Velachery, Chennai, Tamil Nadu',
          pickupCoords: { lat: 13.0418, lon: 80.2341 },
          destinationCoords: { lat: 12.9784, lon: 80.218 },
          vehicleType: 'car',
          distanceMeters: 7450,
          durationSeconds: 1080,
          dataSource: 'fallback_geodata',
          allowMultipleActive: true,
        });
        const captainSafe = sanitizeRideForRole(created, 'captain');
        io.emit('new-ride', captainSafe);
        io.emit('ride-dispatched', captainSafe);
        res.status(201).json({
          message: '[SIMULATION] Dispatched new Chennai demo ride request (T. Nagar → Velachery).',
          ride: created,
        });
        return;
      }

      if (!targetRide) {
        res.status(404).json({ message: 'No active ride found to simulate action on.' });
        return;
      }

      if (action === 'accept-ride') {
        const chosenCaptainId =
          captainId ||
          targetRide.preferredCaptainId ||
          targetRide.matchExplanation?.captainId ||
          repo.listCaptains().find((c) => c.status === 'active')?._id ||
          '671b00000000000000000101';

        const confirmed = repo.confirmRideAtomically(targetRide._id, chosenCaptainId);
        const userPayload = sanitizeRideForRole(confirmed, 'user');
        const capPayload = sanitizeRideForRole(confirmed, 'captain');

        if (typeof confirmed.user === 'object' && confirmed.user) {
          sendMessageToSocketId(confirmed.user.socketId, {
            event: 'ride-confirmed',
            data: userPayload,
          });
          io.to(`user:${confirmed.user._id}`).emit('ride-confirmed', userPayload);
        }
        io.emit('ride-updated', capPayload);
        res.status(200).json({
          message: `[SIMULATION] Captain ${confirmed.matchExplanation?.captainName || ''} accepted ride.`,
          ride: confirmed,
        });
        return;
      }

      if (action === 'start-ride-otp') {
        const assignedCapId =
          typeof targetRide.captain === 'object' && targetRide.captain
            ? targetRide.captain._id
            : String(targetRide.captain || '');
        if (!assignedCapId) {
          res.status(400).json({ message: 'Ride must be accepted before verifying OTP.' });
          return;
        }
        const started = repo.startRideWithOtp({
          rideId: targetRide._id,
          otp: targetRide.otp!,
          authenticatedCaptainId: assignedCapId,
        });
        const userPayload = sanitizeRideForRole(started, 'user');
        if (typeof started.user === 'object' && started.user) {
          sendMessageToSocketId(started.user.socketId, {
            event: 'ride-started',
            data: userPayload,
          });
          io.to(`user:${started.user._id}`).emit('ride-started', userPayload);
        }
        io.emit('ride-updated', sanitizeRideForRole(started, 'captain'));
        res.status(200).json({
          message: `[SIMULATION] Verified OTP (${targetRide.otp}) and started trip.`,
          ride: started,
        });
        return;
      }

      if (action === 'step-gps') {
        const assignedCap =
          typeof targetRide.captain === 'object' && targetRide.captain
            ? targetRide.captain
            : repo.listCaptains()[0];
        const curLon = assignedCap.location.coordinates[0];
        const curLat = assignedCap.location.coordinates[1];
        const targetCoords =
          targetRide.status === 'accepted'
            ? targetRide.pickupCoords
            : targetRide.destinationCoords;

        const nextLat = Number((curLat + (targetCoords.lat - curLat) * 0.45).toFixed(6));
        const nextLon = Number((curLon + (targetCoords.lon - curLon) * 0.45).toFixed(6));

        const updatedCaptain = repo.updateCaptainLocation(assignedCap._id, {
          lat: nextLat,
          lon: nextLon,
        });

        const locPayload = {
          rideId: targetRide._id,
          captainId: assignedCap._id,
          location: { lat: nextLat, lon: nextLon },
          updatedAt: updatedCaptain.location.updatedAt || new Date().toISOString(),
          captain: updatedCaptain,
        };
        if (typeof targetRide.user === 'object' && targetRide.user) {
          sendMessageToSocketId(targetRide.user.socketId, {
            event: 'captain-location-updated',
            data: locPayload,
          });
          io.to(`user:${targetRide.user._id}`).emit('captain-location-updated', locPayload);
        }
        io.emit('fleet-location-updated', locPayload);
        res.status(200).json({
          message: `[SIMULATION] Stepped Captain GPS in Chennai to (${nextLat.toFixed(4)}, ${nextLon.toFixed(4)}).`,
          location: { lat: nextLat, lon: nextLon },
          captain: updatedCaptain,
        });
        return;
      }

      if (action === 'complete-ride') {
        const assignedCapId =
          typeof targetRide.captain === 'object' && targetRide.captain
            ? targetRide.captain._id
            : String(targetRide.captain || '');
        const completed = repo.endRide({
          rideId: targetRide._id,
          authenticatedCaptainId: assignedCapId,
        });
        const userPayload = sanitizeRideForRole(completed, 'user');
        if (typeof completed.user === 'object' && completed.user) {
          sendMessageToSocketId(completed.user.socketId, {
            event: 'ride-ended',
            data: userPayload,
          });
          io.to(`user:${completed.user._id}`).emit('ride-ended', userPayload);
        }
        io.emit('ride-updated', sanitizeRideForRole(completed, 'captain'));
        res.status(200).json({
          message: '[SIMULATION] Completed ongoing Chennai ride and updated captain earnings.',
          ride: completed,
        });
        return;
      }

      res.status(400).json({ message: `Unknown simulation action: ${action}` });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // Mount routes at root (/users, /captains, /maps, /rides, /admin) AND under /api/*
  app.use('/', apiRouter);
  app.use('/api', apiRouter);

  // ---------------- Vite Middleware / Static Production Assets ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/.data/**',
            '**/.aistudio/**',
            '**/test-results/**',
            '**/dist/**',
            '**/*.log',
            '**/.git/**',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'server_started',
        port: PORT,
        persistenceMode: PERSISTENCE_MODE,
        awsRegion: process.env.AWS_REGION || 'ap-south-1',
        operatingArea: 'Chennai, Tamil Nadu, India',
        timestamp: new Date().toISOString(),
      })
    );
  });

  const gracefulShutdown = (signal: string) => {
    if (isDraining) return;
    isDraining = true;
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'graceful_shutdown_initiated',
        signal,
        timestamp: new Date().toISOString(),
      })
    );
    io.emit('server-draining', {
      message: 'Backend instance draining for Auto Scaling; reconnect transparently.',
    });
    server.close(() => {
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'server_closed_cleanly',
          timestamp: new Date().toISOString(),
        })
      );
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 15_000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
