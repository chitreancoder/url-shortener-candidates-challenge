export class NotFoundError extends Error {
  readonly name = "NotFoundError";
}

/** Thrown by a repository when a generated code already exists. */
export class CodeCollisionError extends Error {
  readonly name = "CodeCollisionError";
}

/** Every retry collided; the caller should surface a 500. */
export class CodeGenerationError extends Error {
  readonly name = "CodeGenerationError";
}
