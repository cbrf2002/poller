import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { NeedsSignIn } from '../auth/admin-guard';
import { BackendError } from '../backend/backend';
import { messagePage } from '../pages/public-pages';
import { sendPage } from './respond';

const wantsJson = (req: Request) =>
  req.path.startsWith('/creator/api/') || req.path.endsWith('.json');

/** Turns every failure into a page (or JSON for API routes) without leaking internals. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Poller');

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (res.headersSent) return;

    const signedOut =
      error instanceof NeedsSignIn ||
      (error instanceof BackendError && error.kind === 'unauthenticated');
    if (signedOut) {
      if (wantsJson(req)) {
        res.status(401).json({ error: 'signed_out' });
        return;
      }
      res.redirect(303, '/creator/login');
      return;
    }

    const notFound =
      (error instanceof BackendError && error.kind === 'not_found') ||
      (error instanceof HttpException && error.getStatus() === 404);
    if (notFound) {
      if (wantsJson(req)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      sendPage(
        res,
        messagePage(
          'Page not found',
          'That address doesn’t lead anywhere.',
          '404'
        ),
        404
      );
      return;
    }

    if (error instanceof HttpException && error.getStatus() < 500) {
      res.status(error.getStatus()).type('text/plain').send(error.message);
      return;
    }

    this.logger.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    );
    if (wantsJson(req)) {
      res.status(500).json({ error: 'server_error' });
      return;
    }
    sendPage(
      res,
      messagePage(
        'Something went wrong',
        'Try again in a moment. If it keeps happening, tell the host.',
        '500'
      ),
      500
    );
  }
}
