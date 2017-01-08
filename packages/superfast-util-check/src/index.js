import {isRegExp,isDate,isNull} from "lodash";
import {ValidationError} from "superfast-error";

const types = {
  "array": Array.isArray,
  "regexp": isRegExp,
  "date": isDate,
  "null": isNull,
  "empty": (v) => v == null,
  "truthy": (v) => Boolean(v)
};

const operators = {
  $or(val, ops) {
    return Array.isArray(ops) ?
      ops.some(o => isValid(val, o)) :
      isValid(val, ops);
  },
  $and(val, ops) {
    return Array.isArray(ops) ?
      ops.every(o => isValid(val, o)) :
      isValid(val, ops);
  },
  $not(val, op) {
    return !isValid(val, op);
  },
  $instanceof(val, op) {
    return val instanceof op;
  }
};

export function isValid(value, validate) {
  if (typeof validate === "string") {
    if (typeof value === validate) return true;
    if (!types[validate]) return false;
    return types[validate](value);
  }

  if (Array.isArray(validate)) {
    return validate.every((t) => isValid(value, t));
  }

  if (typeof validate === "function") {
    return Boolean(validate(value));
  }

  if (typeof validate === "object" && validate != null) {
    return Object.keys(validate).every(k => {
      if (operators[k]) return operators[k](value, validate[k]);
      return value != null && isValid(value[k], validate[k]);
    });
  }

  throw new Error("Expecting string type, function or object for validate.");
}

export function check(value, validate, message) {
  if (!isValid(value, validate)) {
    throw new ValidationError(message || "invalid value");
  }

  return value;
}

export function defaults(value, validate, def) {
  if (!isValid(value, validate)) {
    return def;
  }

  return value;
}
