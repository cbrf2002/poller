import { buildResults, tallyChanges, type Tally } from '../shared/results';
import { fingerprint } from '../shared/hash';
import type { Answer, SetContent, SetStatus } from '../shared/model';
import { validateAnswers, validateProfile } from '../shared/validate';
import {
  Backend,
  BackendError,
  type AdminCredentials,
  type FormInput,
  type Progress,
} from '../src/backend/backend';

interface StoredSet {
  slug: string;
  status: SetStatus;
  content: SetContent;
}

interface Person {
  slug: string;
  profile: Record<string, string>;
  answers: Answer[] | null;
}

/**
 * In-memory stand-in for the Convex backend, enough for HTTP tests. It reuses
 * the shared validation so the worker sees the same errors it would in production.
 */
export class MemoryBackend extends Backend {
  admin: AdminCredentials | null = null;
  readonly sessions = new Map<string, string>();
  readonly sets = new Map<string, StoredSet>();
  readonly people = new Map<string, Person>();
  failedLogins = 0;

  addSet(
    slug: string,
    content: SetContent,
    status: SetStatus = 'published'
  ): void {
    this.sets.set(slug, { slug, status, content });
  }

  async credentials(email: string) {
    return this.admin && email.toLowerCase() === 'host@example.com'
      ? this.admin
      : null;
  }
  async loginAllowed() {
    return { ok: this.failedLogins < 3, retryAfter: 60_000 };
  }
  async recordFailedLogin() {
    this.failedLogins++;
  }
  async startSession(s: { tokenHash: string; adminId: string }) {
    this.sessions.set(s.tokenHash, s.adminId);
  }
  async sessionAdmin(tokenHash: string) {
    return this.sessions.has(tokenHash)
      ? { adminId: 'admin1' as never, email: 'host@example.com' }
      : null;
  }
  async endSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async listSets() {
    return [];
  }
  private notInTests(): never {
    throw new Error('Not used by the HTTP tests');
  }
  createSet = (): Promise<string> => this.notInTests();
  getSet = (): never => this.notInTests();
  saveSet = (): never => this.notInTests();
  changeStatus = (): never => this.notInTests();
  removeSet = (): never => this.notInTests();
  removeRespondent = (): never => this.notInTests();
  adminResults = (): never => this.notInTests();
  respondentsPage = (): never => this.notInTests();

  async publicSet(slug: string) {
    const set = this.sets.get(slug);
    if (!set || set.status === 'draft') return null;
    return {
      slug,
      status: set.status,
      version: fingerprint([set.status, set.content]),
      content: set.content,
    };
  }
  async progress(_slug: string, tokenHash: string): Promise<Progress> {
    const person = this.people.get(tokenHash);
    if (!person) return 'new';
    return person.answers ? 'submitted' : 'entered';
  }
  async enter(
    slug: string,
    tokenHash: string,
    _ipKey: string,
    input: FormInput
  ) {
    const set = this.sets.get(slug)!;
    const { values, errors } = validateProfile(set.content.fields, input);
    if (Object.keys(errors).length)
      throw new BackendError('invalid', { errors });
    this.people.set(tokenHash, { slug, profile: values, answers: null });
  }
  async submit(slug: string, tokenHash: string, input: FormInput) {
    const person = this.people.get(tokenHash);
    if (!person) throw new BackendError('not_entered');
    const { answers, errors } = validateAnswers(
      this.sets.get(slug)!.content.questions,
      input
    );
    if (Object.keys(errors).length)
      throw new BackendError('invalid', { errors });
    person.answers = answers;
  }
  async results(slug: string, tokenHash: string) {
    const person = this.people.get(tokenHash);
    const set = this.sets.get(slug);
    if (!set || !person?.answers) return null;
    const tallies: Tally[] = [];
    const answeredBy: Record<string, number> = {};
    const submitted = [...this.people.values()].filter(
      p => p.slug === slug && p.answers
    );
    for (const p of submitted) {
      for (const a of p.answers!) {
        for (const { optionId, amount } of tallyChanges(a)) {
          if (optionId === '*') {
            answeredBy[a.questionId] = (answeredBy[a.questionId] ?? 0) + 1;
            continue;
          }
          const t = tallies.find(
            x => x.questionId === a.questionId && x.optionId === optionId
          );
          if (t) t.count += amount;
          else
            tallies.push({ questionId: a.questionId, optionId, count: amount });
        }
      }
    }
    return {
      title: set.content.title,
      status: set.status,
      version: fingerprint([set.status, set.content]),
      submitted: submitted.length,
      results: buildResults(set.content.questions, tallies, answeredBy),
      mine: Object.fromEntries(
        person.answers.map(a => [a.questionId, a.optionIds])
      ),
    };
  }
}
