import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuth, type AdminSession } from './admin-auth';

/** Thrown when an admin route is hit without a valid session. */
export class NeedsSignIn extends Error {}

const SESSION = Symbol('adminSession');
type WithSession = Request & { [SESSION]?: AdminSession };

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AdminAuth) private readonly auth: AdminAuth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WithSession>();
    const session = await this.auth.current(req);
    if (!session) throw new NeedsSignIn();
    req[SESSION] = session;
    return true;
  }
}

/** The session `AdminGuard` attached to this request. */
export function sessionOf(req: Request): AdminSession {
  const session = (req as WithSession)[SESSION];
  if (!session) throw new NeedsSignIn();
  return session;
}
