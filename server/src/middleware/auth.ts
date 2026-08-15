import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { queryOne } from '../db/pool.js';
import { ApiError } from './error.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'trainer' | 'client';
  trainerId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing bearer token');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(header.slice(7), env.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new ApiError(401, 'Invalid or expired token');
    }

    const user = await queryOne<{
      id: string;
      email: string;
      full_name: string;
      role: 'trainer' | 'client';
      trainer_id: string | null;
    }>(
      `SELECT id, email, full_name, role, trainer_id
       FROM users WHERE id = $1 AND active = TRUE`,
      [payload.sub],
    );

    if (!user) throw new ApiError(401, 'Account not found or deactivated');

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      trainerId: user.trainer_id,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireTrainer(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'trainer') {
    next(new ApiError(403, 'This action is restricted to trainers'));
    return;
  }
  next();
}

/**
 * Resolves whose data a request is operating on.
 *
 * Clients may only ever touch their own rows. Trainers may act on any client
 * assigned to them by passing `?clientId=`, and default to nothing when they
 * don't — a trainer has no data of their own to log.
 */
export async function resolveTargetUserId(req: Request): Promise<string> {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Not authenticated');

  const requested = (req.query.clientId ?? req.body?.clientId) as string | undefined;

  if (user.role === 'client') {
    if (requested && requested !== user.id) {
      throw new ApiError(403, 'Clients can only access their own data');
    }
    return user.id;
  }

  if (!requested) {
    throw new ApiError(400, 'Trainers must specify a clientId');
  }

  const owned = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE id = $1 AND trainer_id = $2',
    [requested, user.id],
  );
  if (!owned) throw new ApiError(403, 'That client is not on your roster');

  return requested;
}
