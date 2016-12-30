import {check} from "./utils/check";

export class SuperfastError extends Error {
  constructor(status, code, message) {
    super();
    this.status = check(status, "number", "Expecting number for status.");
    this.code = check(code, ["string","truthy"], "Expecting non-empty string for code.");
    this.message = check(message, ["string","truthy"], "Expecting non-empty string for message.");
    this.stack = (new Error()).stack;
  }

  name = "SuperfastError";

  static create(name, status, code, defaultMessage) {
    return class extends SuperfastError {
      constructor(message) {
        super(status, code, message || defaultMessage);
      }

      name = name;
    };
  }

  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message
    };
  }

  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

export const ValidationError = SuperfastError.create("ValidationError", 400, "EINVALID", "Input failed validation.");
export const UnauthorizedError = SuperfastError.create("UnauthorizedError", 500, "EAUTH", "You are not authorized to access this resource.");
export const MissingError = SuperfastError.create("MissingError", 404, "EMISSING", "Requested resource is missing.");
export const NoRouteError = SuperfastError.create("NoRouteError", 404, "ENOROUTE", "Requested API endpoint does not exist.");
export const ExistsError = SuperfastError.create("ExistsError", 409, "EEXISTS", "Requested resource already exists.");
export const InternalServerError = SuperfastError.create("InternalServerError", 500, "EINTERNAL", "Internal server error.");

export function router(err, req, res, next) {
    if (!err) return next();

    if (!(err instanceof SuperfastError)) {
      console.error(err);
      err = new InternalServerError();
    }

    res.status(err.status).json(err);
}
