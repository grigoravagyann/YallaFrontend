/**
 * The typed errors a screen branches on, one per refusal it says something
 * specific about.
 *
 * The codes are not typed here. Every `…_CODE` constant is a generated
 * `ProblemCodes` member (`generated/problemCodes.ts`, from the backend's
 * `x-problem-codes`), so a slug is written once — on the backend's
 * `ErrorCodes.cs` — and a code the backend drops or renames fails to compile.
 * The mapping files read each refusal's context through `problemContext`, whose
 * member names come from the same catalogue. What stays hand-written is what
 * the frontend decides: which refusals get a class, what each carries in the
 * client's vocabulary, and its status where the client deliberately differs.
 *
 * The classes live in `contracts/errors/<area>.ts`, one file per area; this
 * file is the one import path for all of them.
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
