import * as defaultHandlers from "./handlers";
import {ValidationError} from "superfast-error";

export async function validate(event, id, opts) {
  const valid = await event.reduce(async function(m, fn, ob) {
    if (!(await fn.call(ob, event, id, opts))) {
      event.stopImmediatePropagation();
      return false;
    }

    return true;
  }, true);

  if (!valid) {
    throw new ValidationError();
  }
}

export async function normalize(event, data, doc, id, opts) {
  const res = await event.reduce(function(m, fn, ob) {
    return fn.call(ob, event, m, doc, id, opts);
  }, data);

  if (event.model.schema && !event.model.schema(res)) {
    const err = event.model.schema.errors[0];
    throw new ValidationError(err.message);
  }

  return res;
}

export async function handle(event, ...args) {
  event.defaultListener = defaultHandlers[event.action];

  return await event.reduce(function(m, fn, ob) {
    return fn.call(ob, event, ...args);
  });
}

export async function transform(event, data, id, opts) {
  return await event.reduce(function(m, fn, ob) {
    return fn.call(ob, event, m, id, opts);
  }, data);
}