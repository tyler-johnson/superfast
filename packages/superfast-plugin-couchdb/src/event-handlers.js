import {ValidationError} from "superfast-error";

export async function validate(event, ...args) {
  const valid = await event.reduce(async function(m, fn, ob) {
    if (!(await fn.call(ob, event, ...args))) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return false;
    }

    return true;
  }, true);

  if (!valid) {
    throw new ValidationError();
  }
}

function stdReduce(event, data, ...args) {
  return event.reduce(function(m, fn, ob) {
    return fn.call(ob, event, m, ...args);
  }, data);
}

export const transform = stdReduce;
export const normalize = stdReduce;

export function change(event, ...args) {
  return event.reduce(async function(m, fn, ob) {
    const res = await fn.call(ob, event, ...args);
    if (typeof res !== "undefined") {
      event.stopImmediatePropagation();
      event.preventDefault();
      return res;
    }
  });
}