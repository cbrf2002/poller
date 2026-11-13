import { ConvexHttpClient } from 'convex/browser';
import type { FunctionArgs, FunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { SetContent, SetStatus } from '../../shared/model';
import type { AppConfig } from '../config';
import { Backend, BackendError, type FormInput } from './backend';

type WithoutSecret<F extends FunctionReference<'query' | 'mutation'>> = Omit<
  FunctionArgs<F>,
  'secret'
>;

export class ConvexBackend extends Backend {
  private readonly client: ConvexHttpClient;

  constructor(private readonly config: AppConfig) {
    super();
    this.client = new ConvexHttpClient(config.convexUrl, { logger: false });
  }

  private async call<R>(run: () => Promise<R>): Promise<R> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ConvexError) {
        const data = (error.data ?? {}) as Record<string, unknown>;
        throw new BackendError(String(data.kind ?? 'unknown'), data);
      }
      throw error;
    }
  }

  private query<F extends FunctionReference<'query'>>(
    fn: F,
    args: WithoutSecret<F>
  ) {
    const full = {
      ...args,
      secret: this.config.serverSecret,
    } as FunctionArgs<F>;
    return this.call(() => this.client.query(fn, full));
  }

  private mutation<F extends FunctionReference<'mutation'>>(
    fn: F,
    args: WithoutSecret<F>
  ) {
    const full = {
      ...args,
      secret: this.config.serverSecret,
    } as FunctionArgs<F>;
    // The client is shared across Worker requests. Its default queue would
    // run another request's I/O in the first request's context.
    return this.call(() => this.client.mutation(fn, full, { skipQueue: true }));
  }

  private admin(session: string) {
    return { session, now: Date.now() };
  }

  credentials(email: string) {
    return this.query(api.admins.credentials, { email });
  }
  loginAllowed(key: string) {
    return this.mutation(api.admins.loginAllowed, { key });
  }
  async recordFailedLogin(key: string) {
    await this.mutation(api.admins.recordFailedLogin, { key });
  }
  async startSession(s: {
    adminId: string;
    tokenHash: string;
    expiresAt: number;
    key: string;
  }) {
    await this.mutation(api.admins.startSession, s);
  }
  sessionAdmin(tokenHash: string) {
    return this.query(api.admins.sessionAdmin, { tokenHash, now: Date.now() });
  }
  async endSession(tokenHash: string) {
    await this.mutation(api.admins.endSession, { tokenHash });
  }

  listSets(session: string) {
    return this.query(api.sets.list, this.admin(session));
  }
  createSet(session: string, title: string) {
    return this.mutation(api.sets.create, { ...this.admin(session), title });
  }
  getSet(session: string, setId: string) {
    return this.query(api.sets.get, { ...this.admin(session), setId });
  }
  saveSet(session: string, setId: string, content: SetContent) {
    return this.mutation(api.sets.save, {
      ...this.admin(session),
      setId,
      content,
    });
  }
  async changeStatus(session: string, setId: string, status: SetStatus) {
    await this.mutation(api.sets.changeStatus, {
      ...this.admin(session),
      setId,
      status,
    });
  }
  async removeRespondent(session: string, setId: string, respondentId: string) {
    await this.mutation(api.sets.removeRespondent, {
      ...this.admin(session),
      setId,
      respondentId,
    });
  }
  async removeSet(session: string, setId: string) {
    await this.mutation(api.sets.remove, { ...this.admin(session), setId });
  }
  adminResults(session: string, setId: string) {
    return this.query(api.sets.results, { ...this.admin(session), setId });
  }
  respondentsPage(
    session: string,
    setId: string,
    cursor: string | null,
    size: number
  ) {
    return this.query(api.sets.respondentsPage, {
      ...this.admin(session),
      setId,
      paginationOpts: { numItems: size, cursor },
    });
  }

  publicSet(slug: string) {
    return this.query(api.participation.publicSet, { slug });
  }
  progress(slug: string, tokenHash: string) {
    return this.query(api.participation.progress, { slug, tokenHash });
  }
  async enter(
    slug: string,
    tokenHash: string,
    ipKey: string,
    input: FormInput
  ) {
    await this.mutation(api.participation.enter, {
      slug,
      tokenHash,
      ipKey,
      input,
    });
  }
  async submit(slug: string, tokenHash: string, input: FormInput) {
    await this.mutation(api.participation.submit, { slug, tokenHash, input });
  }
  results(slug: string, tokenHash: string) {
    return this.query(api.participation.results, { slug, tokenHash });
  }
}
