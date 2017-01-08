export default class SuperfastError extends Error {
  constructor(status, code, message) {
    super();
    this.status = status;
    this.code = code;
    this.message = message;
    this.stack = (new Error(this.toString())).stack;
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

  static isError = isError;

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

export function isError(v) {
  return v instanceof SuperfastError;
}

export const ValidationError = SuperfastError.create("ValidationError", 400, "EINVALID", "Input failed validation.");
export const UnauthorizedError = SuperfastError.create("UnauthorizedError", 500, "EAUTH", "You are not authorized to access this resource.");
export const MissingError = SuperfastError.create("MissingError", 404, "EMISSING", "Requested resource is missing.");
export const NoRouteError = SuperfastError.create("NoRouteError", 404, "ENOROUTE", "Requested API endpoint does not exist.");
export const ExistsError = SuperfastError.create("ExistsError", 409, "EEXISTS", "Requested resource already exists.");
export const InternalServerError = SuperfastError.create("InternalServerError", 500, "EINTERNAL", "Internal server error.");
