import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';
import type { SetContent, SetStatus } from '../../shared/model';

export type AdminCredentials = NonNullable<
  FunctionReturnType<typeof api.admins.credentials>
>;
export type SessionAdmin = NonNullable<
  FunctionReturnType<typeof api.admins.sessionAdmin>
>;
export type SetSummary = FunctionReturnType<typeof api.sets.list>[number];
export type EditableSet = FunctionReturnType<typeof api.sets.get>;
export type SaveOutcome = FunctionReturnType<typeof api.sets.save>;
export type AdminResults = FunctionReturnType<typeof api.sets.results>;
export type RespondentsPage = FunctionReturnType<
  typeof api.sets.respondentsPage
>;
export type PublicSet = NonNullable<
  FunctionReturnType<typeof api.participation.publicSet>
>;
export type Progress = NonNullable<
  FunctionReturnType<typeof api.participation.progress>
>;
export type PublicResults = NonNullable<
  FunctionReturnType<typeof api.participation.results>
>;
export type FormInput = Record<string, string | string[]>;

/** Failure reported by the backend, keyed by the `kind` the Convex side throws. */
export class BackendError extends Error {
  constructor(
    readonly kind: string,
    readonly data: Record<string, unknown> = {}
  ) {
    super(`Backend refused the request: ${kind}`);
  }
}

/**
 * Everything the worker asks of the data layer. `ConvexBackend` is the real
 * one; tests substitute an in-memory version.
 */
export abstract class Backend {
  abstract credentials(email: string): Promise<AdminCredentials | null>;
  abstract loginAllowed(
    key: string
  ): Promise<{ ok: boolean; retryAfter: number }>;
  abstract recordFailedLogin(key: string): Promise<void>;
  abstract startSession(s: {
    adminId: string;
    tokenHash: string;
    expiresAt: number;
    key: string;
  }): Promise<void>;
  abstract sessionAdmin(tokenHash: string): Promise<SessionAdmin | null>;
  abstract endSession(tokenHash: string): Promise<void>;

  abstract listSets(session: string): Promise<SetSummary[]>;
  abstract createSet(session: string, title: string): Promise<string>;
  abstract getSet(session: string, setId: string): Promise<EditableSet>;
  abstract saveSet(
    session: string,
    setId: string,
    content: SetContent
  ): Promise<SaveOutcome>;
  abstract changeStatus(
    session: string,
    setId: string,
    status: SetStatus
  ): Promise<void>;
  abstract removeSet(session: string, setId: string): Promise<void>;
  abstract adminResults(session: string, setId: string): Promise<AdminResults>;
  abstract respondentsPage(
    session: string,
    setId: string,
    cursor: string | null,
    size: number
  ): Promise<RespondentsPage>;

  abstract publicSet(slug: string): Promise<PublicSet | null>;
  abstract progress(slug: string, tokenHash: string): Promise<Progress | null>;
  abstract enter(
    slug: string,
    tokenHash: string,
    ipKey: string,
    input: FormInput
  ): Promise<void>;
  abstract submit(
    slug: string,
    tokenHash: string,
    input: FormInput
  ): Promise<void>;
  abstract results(
    slug: string,
    tokenHash: string
  ): Promise<PublicResults | null>;
}
