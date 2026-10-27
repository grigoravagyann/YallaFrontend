/**
 * The typed errors a screen branches on, one per refusal it says something
 * specific about.
 *
 * The backend's catalogue is not repeated here. Every `…_CODE` constant is a
 * generated `ProblemCodes` member (`generated/problemCodes.ts`, from the
 * backend's `x-problem-codes`), so a slug is written once — on the backend's
 * `ErrorCodes.cs` — and a code the backend drops or renames fails to compile.
 * A class thrown for one code takes its HTTP status from `PROBLEM_CODE_STATUS`
 * too; a literal status is one the client decides (a class mapped from a bare
 * status, or one that deliberately differs, which says why). The mapping files
 * read each refusal's context through `problemContext`, whose member names come
 * from the same catalogue. A new backend code needs nothing here until a screen
 * has something specific to say about it.
 *
 * What stays hand-written is what the frontend decides: which refusals get a
 * class, what each carries in the client's vocabulary, and the `is…` narrowing
 * helpers. The classes live in `contracts/errors/<area>.ts`, one file per area;
 * this file is the one import path for all of them.
 * `check-problem-codes.mjs` lists the backend codes no class or branch handles.
 */
export * from './errors/booking';
export * from './errors/phoneProof';
export * from './errors/tab';
export * from './errors/staffAuth';
export * from './errors/floor';
export * from './errors/endpointNotWired';
export * from './errors/console';
export * from './errors/accounts';
export * from './errors/places';
export * from './errors/guestRecord';
export * from './errors/preOrder';
export * from './errors/askOnMyWay';
export * from './errors/takeaway';
export * from './errors/messages';
export * from './errors/features';
