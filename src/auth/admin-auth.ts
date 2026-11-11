import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Backend, type SessionAdmin } from '../backend/backend';
import { APP_CONFIG, type AppConfig } from '../config';
import {
  PBKDF2_ITERATIONS,
  pbkdf2,
  randomToken,
  sameString,
  sha256,
} from '../crypto';
import { cookieName, readCookie, serializeCookie } from '../http/cookies';
import { clientIp } from '../http/security';

const SESSION_SECONDS = 12 * 60 * 60;
// Verified against when the email is unknown, so both paths cost the same.
const DUMMY_SALT = '00112233445566778899aabbccddeeff';

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfter: number };

export interface AdminSession {
  admin: SessionAdmin;
  tokenHash: string;
}

@Injectable()
export class AdminAuth {
  constructor(
    @Inject(Backend) private readonly backend: Backend,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  private get cookie(): string {
    return cookieName('poller_admin', this.config.secureCookies);
  }

  /** Rate-limit key: the caller's IP, hashed with the server secret. */
  private attemptKey(req: Request): Promise<string> {
    return sha256(`login:${clientIp(req)}:${this.config.serverSecret}`);
  }

  async signIn(
    req: Request,
    res: Response,
    email: string,
    password: string
  ): Promise<SignInResult> {
    const key = await this.attemptKey(req);
    const gate = await this.backend.loginAllowed(key);
    if (!gate.ok)
      return { ok: false, reason: 'locked', retryAfter: gate.retryAfter };

    const record =
      email && password ? await this.backend.credentials(email) : null;
    const derived = await pbkdf2(
      password.slice(0, 512),
      record?.salt ?? DUMMY_SALT,
      record?.iterations ?? PBKDF2_ITERATIONS
    );
    if (!record || !sameString(derived, record.passwordHash)) {
      await this.backend.recordFailedLogin(key);
      return { ok: false, reason: 'invalid' };
    }

    const token = randomToken();
    await this.backend.startSession({
      adminId: record.adminId,
      tokenHash: await sha256(token),
      expiresAt: Date.now() + SESSION_SECONDS * 1000,
      key,
    });
    res.append(
      'Set-Cookie',
      serializeCookie(this.cookie, token, {
        maxAge: SESSION_SECONDS,
        secure: this.config.secureCookies,
        sameSite: 'Lax',
      })
    );
    return { ok: true };
  }

  async current(req: Request): Promise<AdminSession | null> {
    const token = readCookie(req.get('cookie'), this.cookie);
    if (!token || token.length > 128) return null;
    const tokenHash = await sha256(token);
    const admin = await this.backend.sessionAdmin(tokenHash);
    return admin ? { admin, tokenHash } : null;
  }

  async signOut(req: Request, res: Response): Promise<void> {
    const session = await this.current(req);
    if (session) await this.backend.endSession(session.tokenHash);
    res.append(
      'Set-Cookie',
      serializeCookie(this.cookie, '', {
        maxAge: 0,
        secure: this.config.secureCookies,
        sameSite: 'Lax',
      })
    );
  }
}
