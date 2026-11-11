import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SLUG_PATTERN } from '../../shared/model';
import { Backend, BackendError, type PublicSet } from '../backend/backend';
import { APP_CONFIG, type AppConfig } from '../config';
import { randomToken, sha256 } from '../crypto';
import { cookieName, readCookie, serializeCookie } from '../http/cookies';
import { bodyString, prefixedInput } from '../http/forms';
import { allowChallengeOrigin, clientIp } from '../http/security';
import { TURNSTILE_ORIGIN, verifyTurnstile } from '../turnstile';
import { sendPage } from '../http/respond';
import {
  closedPage,
  entryPage,
  type EntryOptions,
  homePage,
  messagePage,
  pollPage,
  resultsPage,
} from '../pages/public-pages';

const PARTICIPANT_SECONDS = 60 * 60 * 24 * 60;

function goneMessage(res: Response): void {
  sendPage(
    res,
    messagePage(
      'This poll isn’t available',
      'Check the code with your host. It may not be published yet, or it was removed.',
      'Not found'
    ),
    404
  );
}

@Controller()
export class PublicController {
  constructor(
    @Inject(Backend) private readonly backend: Backend,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  private cookie(slug: string): string {
    return cookieName(`poller_p_${slug}`, this.config.secureCookies);
  }

  private async tokenHash(req: Request, slug: string): Promise<string | null> {
    const token = readCookie(req.get('cookie'), this.cookie(slug));
    return token && token.length <= 128 ? sha256(token) : null;
  }

  /** Sends the entry form, with the Turnstile widget when the check is on. */
  private sendEntry(
    res: Response,
    set: PublicSet,
    options: Omit<EntryOptions, 'siteKey'> = {},
    status = 200
  ): void {
    const siteKey = this.config.turnstile?.siteKey ?? null;
    if (siteKey) allowChallengeOrigin(res, TURNSTILE_ORIGIN);
    sendPage(res, entryPage(set, { ...options, siteKey }), status);
  }

  private async openSet(slug: string): Promise<PublicSet | null> {
    return SLUG_PATTERN.test(slug) ? this.backend.publicSet(slug) : null;
  }

  @Get()
  home(@Res() res: Response): void {
    sendPage(res, homePage());
  }

  /** The join form: accepts a bare code or a pasted link. */
  @Get('go')
  join(@Query('code') code: unknown, @Res() res: Response): void {
    const raw = typeof code === 'string' ? code.trim().toLowerCase() : '';
    const slug = raw.split(/[/?#]/).filter(Boolean).pop() ?? '';
    if (SLUG_PATTERN.test(slug)) return res.redirect(303, `/p/${slug}`);
    sendPage(
      res,
      homePage(
        'That code doesn’t look right. Codes are 10 letters and numbers.'
      ),
      400
    );
  }

  @Get('p/:slug')
  async show(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const set = await this.openSet(slug);
    if (!set) return goneMessage(res);
    const hash = await this.tokenHash(req, slug);
    const progress = hash ? await this.backend.progress(slug, hash) : 'new';

    if (progress === 'submitted')
      return res.redirect(303, `/p/${slug}/results`);
    if (set.status === 'closed') return sendPage(res, closedPage(set));
    if (progress === 'entered') return sendPage(res, pollPage(set));
    this.sendEntry(res, set);
  }

  @Post('p/:slug/enter')
  async enter(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const set = await this.openSet(slug);
    if (!set) return goneMessage(res);
    const values = prefixedInput(req.body, 'f.');

    if (this.config.turnstile) {
      const passed = await verifyTurnstile(
        this.config.turnstile.secretKey,
        bodyString(req.body, 'cf-turnstile-response'),
        clientIp(req)
      );
      if (!passed) {
        return this.sendEntry(
          res,
          set,
          {
            values,
            checkError: 'The quick check didn’t go through. Try it again.',
          },
          422
        );
      }
    }

    const existing = readCookie(req.get('cookie'), this.cookie(slug));
    const token = existing && existing.length <= 128 ? existing : randomToken();
    const ipKey = await sha256(
      `enter:${clientIp(req)}:${this.config.serverSecret}`
    );

    try {
      await this.backend.enter(slug, await sha256(token), ipKey, values);
    } catch (error) {
      if (!(error instanceof BackendError)) throw error;
      if (error.kind === 'invalid') {
        return this.sendEntry(
          res,
          set,
          { values, errors: error.data.errors as Record<string, string> },
          422
        );
      }
      if (error.kind === 'rate_limited') {
        res.setHeader(
          'Retry-After',
          String(Math.ceil(Number(error.data.retryAfter ?? 60000) / 1000))
        );
        return sendPage(
          res,
          messagePage(
            'Too many people at once',
            'Wait a minute, then try again.',
            'Busy'
          ),
          429
        );
      }
      if (error.kind === 'closed') return res.redirect(303, `/p/${slug}`);
      throw error;
    }

    res.append(
      'Set-Cookie',
      serializeCookie(this.cookie(slug), token, {
        maxAge: PARTICIPANT_SECONDS,
        secure: this.config.secureCookies,
        sameSite: 'Lax',
      })
    );
    res.redirect(303, `/p/${slug}`);
  }

  @Post('p/:slug/submit')
  async submit(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const set = await this.openSet(slug);
    if (!set) return goneMessage(res);
    const hash = await this.tokenHash(req, slug);
    if (!hash) return res.redirect(303, `/p/${slug}`);
    const answers = prefixedInput(req.body, 'q.');

    try {
      await this.backend.submit(slug, hash, answers);
    } catch (error) {
      if (!(error instanceof BackendError)) throw error;
      if (error.kind === 'invalid') {
        return sendPage(
          res,
          pollPage(set, answers, error.data.errors as Record<string, string>),
          422
        );
      }
      if (error.kind === 'not_entered' || error.kind === 'closed') {
        return res.redirect(303, `/p/${slug}`);
      }
      throw error;
    }
    res.redirect(303, `/p/${slug}/results`);
  }

  @Get('p/:slug/results')
  async results(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    if (!SLUG_PATTERN.test(slug)) return goneMessage(res);
    const hash = await this.tokenHash(req, slug);
    const data = hash ? await this.backend.results(slug, hash) : null;
    if (!data) return res.redirect(303, `/p/${slug}`);
    sendPage(res, resultsPage(slug, data));
  }

  /** Polled by the results page while the set is open. */
  @Get('p/:slug/results.json')
  async resultsJson(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const hash = SLUG_PATTERN.test(slug)
      ? await this.tokenHash(req, slug)
      : null;
    const data = hash ? await this.backend.results(slug, hash) : null;
    if (!data) return res.status(404).json({ error: 'not_found' });
    res.json({
      submitted: data.submitted,
      status: data.status,
      results: data.results,
    });
  }

  /** Polled by the question page so people learn about live edits. */
  @Get('p/:slug/version')
  async version(@Param('slug') slug: string, @Res() res: Response) {
    const set = await this.openSet(slug);
    if (!set) return res.status(404).json({ error: 'not_found' });
    res.json({ version: set.version, status: set.status });
  }
}
