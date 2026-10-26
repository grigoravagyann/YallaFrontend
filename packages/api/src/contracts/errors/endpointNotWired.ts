/**
 * An action whose backend endpoint does not exist yet.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';

/**
 * The endpoint for this action does not exist on the backend yet.
 *
 * A real, thrown, typed error rather than a silent no-op or a fake success.
 * Screens catch it and say plainly that the feature is not live — the one thing
 * they must never do is show a confirmation for something that never happened.
 *
 * Every use of this is a TODO with an owner. Grep for the class name to find
 * what is still unwired.
 */
export class EndpointNotWiredError extends ApiError {
  readonly endpoint: string;

  constructor(options: { url: string; endpoint: string }) {
    super(`No backend endpoint yet for ${options.endpoint}.`, {
      status: 501,
      url: options.url,
    });
    this.name = 'EndpointNotWiredError';
    this.endpoint = options.endpoint;
  }
}

export function isEndpointNotWired(error: unknown): error is EndpointNotWiredError {
  return error instanceof EndpointNotWiredError;
}
