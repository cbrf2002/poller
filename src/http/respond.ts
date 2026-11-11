import type { Response } from 'express';
import type { SafeHtml } from '../views/html';

export function sendPage(res: Response, body: SafeHtml, status = 200): void {
  res.status(status).type('html').send(body.value);
}
