import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, requireTrainer, signToken } from '../middleware/auth.js';

export const authRouter = Router();

const credentials = {
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
};

const registerTrainerSchema = z.object({
  ...credentials,
  fullName: z.string().min(1),
});

const registerClientSchema = z.object({
  ...credentials,
  fullName: z.string().min(1),
  inviteCode: z.string().min(1),
  dateOfBirth: z.string().date().optional(),
  heightCm: z.number().positive().max(300).optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  goal: z.string().optional(),
});

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: 'trainer' | 'client';
  trainer_id: string | null;
  password_hash?: string;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    trainerId: row.trainer_id,
  };
}

authRouter.post(
  '/register/trainer',
  asyncHandler(async (req, res) => {
    const body = registerTrainerSchema.parse(req.body);
    const hash = await bcrypt.hash(body.password, 12);

    const user = await queryOne<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'trainer')
       RETURNING id, email, full_name, role, trainer_id`,
      [body.email, hash, body.fullName],
    );
    if (!user) throw new ApiError(500, 'Could not create account');

    res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
  }),
);

authRouter.post(
  '/register/client',
  asyncHandler(async (req, res) => {
    const body = registerClientSchema.parse(req.body);

    const user = await transaction(async (client) => {
      // Lock the invite so two people can't redeem the same code concurrently.
      const invite = await client.query<{ trainer_id: string }>(
        `SELECT trainer_id FROM invites
         WHERE code = $1 AND redeemed_by IS NULL AND expires_at > now()
         FOR UPDATE`,
        [body.inviteCode.trim().toUpperCase()],
      );
      const row = invite.rows[0];
      if (!row) throw new ApiError(400, 'Invite code is invalid, expired, or already used');

      const hash = await bcrypt.hash(body.password, 12);
      const created = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, full_name, role, trainer_id,
                            date_of_birth, height_cm, sex, goal)
         VALUES ($1, $2, $3, 'client', $4, $5, $6, $7, $8)
         RETURNING id, email, full_name, role, trainer_id`,
        [
          body.email,
          hash,
          body.fullName,
          row.trainer_id,
          body.dateOfBirth ?? null,
          body.heightCm ?? null,
          body.sex ?? null,
          body.goal ?? null,
        ],
      );

      const newUser = created.rows[0];
      if (!newUser) throw new ApiError(500, 'Could not create account');

      await client.query(
        'UPDATE invites SET redeemed_by = $1, redeemed_at = now() WHERE code = $2',
        [newUser.id, body.inviteCode.trim().toUpperCase()],
      );

      return newUser;
    });

    res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = z.object(credentials).parse(req.body);

    const user = await queryOne<Required<UserRow>>(
      `SELECT id, email, full_name, role, trainer_id, password_hash
       FROM users WHERE email = $1 AND active = TRUE`,
      [body.email],
    );

    // Compare against a dummy hash when the user is missing so that response
    // timing doesn't reveal which emails are registered.
    const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(body.password, hash);

    if (!user || !ok) throw new ApiError(401, 'Incorrect email or password');

    res.json({ token: signToken(user.id), user: toPublicUser(user) });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

/** Trainer generates a code a client redeems at sign-up. */
authRouter.post(
  '/invites',
  authenticate,
  requireTrainer,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ email: z.string().email().optional(), expiresInDays: z.number().int().min(1).max(90).default(14) })
      .parse(req.body ?? {});

    // Base32-ish alphabet, no look-alike characters, for reading aloud.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(randomBytes(8))
      .map((b) => alphabet[b % alphabet.length])
      .join('');

    await query(
      `INSERT INTO invites (code, trainer_id, email, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [code, req.user!.id, body.email ?? null, body.expiresInDays],
    );

    res.status(201).json({ code, expiresInDays: body.expiresInDays });
  }),
);
