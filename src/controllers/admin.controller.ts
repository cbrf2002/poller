import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SET_STATUSES, type SetStatus } from '../../shared/model';
import { normalizeSetContent } from '../../shared/validate';
import { answerSummary } from '../../shared/results';
import { AdminAuth } from '../auth/admin-auth';
import { AdminGuard, sessionOf } from '../auth/admin-guard';
import {
  Backend,
  BackendError,
  type RespondentsPage,
} from '../backend/backend';
import { csvRow } from '../csv';
import { bodyString, publicOrigin } from '../http/forms';
import { sendPage } from '../http/respond';
import {
  adminResultsPage,
  dashboardPage,
  editorPage,
  loginPage,
} from '../pages/admin-pages';

const PAGE_SIZE = 50;

@Controller('creator')
export class AdminSignInController {
  constructor(@Inject(AdminAuth) private readonly auth: AdminAuth) {}

  @Get('login')
  async form(@Req() req: Request, @Res() res: Response) {
    if (await this.auth.current(req)) return res.redirect(303, '/creator');
    sendPage(res, loginPage());
  }

  @Post('login')
  async signIn(@Req() req: Request, @Res() res: Response) {
    const email = bodyString(req.body, 'email').trim().slice(0, 254);
    const password = bodyString(req.body, 'password');
    const result = await this.auth.signIn(req, res, email, password);
    if (result.ok) return res.redirect(303, '/creator');
    if (result.reason === 'locked') {
      const minutes = Math.max(1, Math.ceil(result.retryAfter / 60000));
      res.setHeader('Retry-After', String(minutes * 60));
      return sendPage(
        res,
        loginPage(`Too many attempts. Try again in ${minutes} min.`, email),
        429
      );
    }
    sendPage(
      res,
      loginPage('That email and password don’t match.', email),
      401
    );
  }

  @Post('logout')
  async signOut(@Req() req: Request, @Res() res: Response) {
    await this.auth.signOut(req, res);
    res.redirect(303, '/creator/login');
  }
}

@Controller('creator')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(Backend) private readonly backend: Backend) {}

  @Get()
  async dashboard(@Req() req: Request, @Res() res: Response) {
    const { admin, tokenHash } = sessionOf(req);
    sendPage(res, dashboardPage(admin, await this.backend.listSets(tokenHash)));
  }

  @Post('sets')
  async create(@Req() req: Request, @Res() res: Response) {
    const title = bodyString(req.body, 'title');
    const id = await this.backend.createSet(sessionOf(req).tokenHash, title);
    res.redirect(303, `/creator/sets/${id}`);
  }

  @Get('sets/:id')
  async edit(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { admin, tokenHash } = sessionOf(req);
    const set = await this.backend.getSet(tokenHash, id);
    sendPage(res, editorPage(admin, set, publicOrigin(req)));
  }

  @Post('sets/:id/status')
  async changeStatus(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { admin, tokenHash } = sessionOf(req);
    const status = bodyString(req.body, 'status') as SetStatus;
    if (!SET_STATUSES.includes(status))
      return res.redirect(303, `/creator/sets/${id}`);
    try {
      await this.backend.changeStatus(tokenHash, id, status);
    } catch (error) {
      if (error instanceof BackendError && error.kind === 'not_ready') {
        const set = await this.backend.getSet(tokenHash, id);
        const problems = (error.data.problems as string[] | undefined) ?? [];
        return sendPage(
          res,
          editorPage(admin, set, publicOrigin(req), problems),
          422
        );
      }
      throw error;
    }
    res.redirect(303, `/creator/sets/${id}`);
  }

  @Post('sets/:id/delete')
  async remove(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    await this.backend.removeSet(sessionOf(req).tokenHash, id);
    res.redirect(303, '/creator');
  }

  @Post('sets/:id/respondents/:respondentId/delete')
  async removeRespondent(
    @Param('id') id: string,
    @Param('respondentId') respondentId: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    await this.backend.removeRespondent(
      sessionOf(req).tokenHash,
      id,
      respondentId
    );
    res.redirect(303, `/creator/sets/${id}/results`);
  }

  @Get('sets/:id/results')
  async results(
    @Param('id') id: string,
    @Query('after') after: unknown,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { admin, tokenHash } = sessionOf(req);
    const cursor =
      typeof after === 'string' && after.length < 2048 ? after : null;
    const [data, people] = await Promise.all([
      this.backend.adminResults(tokenHash, id),
      this.backend.respondentsPage(tokenHash, id, cursor, PAGE_SIZE),
    ]);
    sendPage(res, adminResultsPage(admin, data, people, cursor));
  }

  @Get('sets/:id/export.csv')
  async exportCsv(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { tokenHash } = sessionOf(req);
    const data = await this.backend.adminResults(tokenHash, id);
    const questions = data.questions;
    let csv = csvRow([
      'Joined (UTC)',
      'Submitted (UTC)',
      ...data.fields.map(f => f.label),
      ...questions.map(q => q.prompt),
    ]);

    let cursor: string | null = null;
    for (let pageNo = 0; pageNo < 100; pageNo++) {
      const page: RespondentsPage = await this.backend.respondentsPage(
        tokenHash,
        id,
        cursor,
        200
      );
      for (const person of page.page) {
        const answers = new Map(person.answers.map(a => [a.questionId, a]));
        csv += csvRow([
          new Date(person.enteredAt).toISOString(),
          person.submittedAt === null
            ? ''
            : new Date(person.submittedAt).toISOString(),
          ...data.fields.map(f => person.profile[f.id] ?? ''),
          ...questions.map(q => {
            const a = answers.get(q.id);
            return a ? answerSummary(q, a, '; ') : '';
          }),
        ]);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const name = (data.title || 'poll')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    res
      .type('text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${name || 'poll'}-responses.csv"`
      );
    res.send('﻿' + csv);
  }
}

/** JSON endpoints used by the editor and the live results view. */
@Controller('creator/api')
@UseGuards(AdminGuard)
export class AdminApiController {
  constructor(@Inject(Backend) private readonly backend: Backend) {}

  @Put('sets/:id')
  async save(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const content = normalizeSetContent(
      (req.body as { content?: unknown } | undefined)?.content
    );
    const outcome = await this.backend.saveSet(
      sessionOf(req).tokenHash,
      id,
      content
    );
    res.json(outcome);
  }

  @Get('sets/:id/results')
  async results(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const data = await this.backend.adminResults(sessionOf(req).tokenHash, id);
    res.json({
      submitted: data.submitted,
      status: data.status,
      results: data.results,
    });
  }
}
