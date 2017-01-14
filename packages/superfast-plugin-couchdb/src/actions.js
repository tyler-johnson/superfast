import {MissingError,ExistsError} from "superfast-error";
import {fetch,pouchOpts,save} from "./db";
import {check} from "superfast-util-check";
import {omit} from "lodash";

function throwIfExists(prev) {
  if (prev != null) throw new ExistsError("Document already exists.");
}

function throwIfMissing(prev) {
  if (prev == null) throw new MissingError(`No ${this.model.name} exists with that ID.`);
}

function fireTransform(action, ctx, args, res) {
  const trevent = ctx.createEvent(action, "transform", {
    defaultListener: (e, d) => omit(d, "_rev")
  });

  return action.fire(trevent, res, ...args);
}

export const query = [
  async function query(ctx, opts) {
    await ctx.model.setup();
    await ctx.fire(this, "validate", null, opts);
    const popts = pouchOpts(false, ctx.model.conf.query, null, opts);
    const {total_rows,rows} = await fetch(ctx.db, popts);
    
    let newrows = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      newrows[i] = await fireTransform(this, ctx, [null, opts], rows[i]);
    }

    return {
      total_rows,
      rows: newrows
    };
  }, {
    httpserver: {
      method: "GET",
      path: "/",
      args: (req) => [req.query]
    }
  }
];

async function eventWrapper(action, ctx, args, fn) {
  await ctx.model.setup();
  await ctx.fire(action, "validate", ...args);
  const res = await fn();
  return await fireTransform(action, ctx, args, res);
}

export const get = [
  function get(ctx, key, opts) {
    check(key, ["string","truthy"], "Expecting non-empty string for key");
    return eventWrapper(this, ctx, [key,opts], async () => {
      const popts = pouchOpts(true, ctx.model.conf.query, key, opts);
      const res = await fetch(ctx.db, popts);
      throwIfMissing.call(this, res);
      return res;
    });
  }, {
    httpserver: {
      method: "GET",
      path: "/:id",
      args: (req) => [req.params.id, req.query]
    }
  }
];

function saveDoc(before, e, doc, key, opts) {
  const popts = pouchOpts(true, e.model.conf.query, key, opts);
  return save(e.model.db, popts, (prev) => {
    if (before) before.call(this, prev);

    const event = e.context.createEvent(this, "normalize", {
      defaultListener: (evt, d) => popts.include_docs ? d : null
    });

    return this.fire(event, doc, prev, key, opts);
  });
}

function saveWrapper(action, ctx, doc, args, before) {
  return eventWrapper(action, ctx, args, () => {
    const event = ctx.createEvent(action, "change", {
      defaultListener: saveDoc.bind(action, before)
    });

    return action.fire(event, doc, ...args);
  });
}

export const create = [
  function create(ctx, doc, opts) {
    check(doc, ["object","truthy"], "Expecting object for document");
    return saveWrapper(this, ctx, doc, [null,opts], throwIfExists);
  }, {
    httpserver: {
      method: "POST",
      path: "/",
      args: (req) => [req.body, req.query]
    }
  }
];

export const update = [
  function update(ctx, key, doc, opts) {
    check(key, ["string","truthy"], "Expecting non-empty string for key");
    check(doc, ["object","truthy"], "Expecting object for document");
    return saveWrapper(this, ctx, doc, [key,opts], throwIfMissing);
  }, {
    httpserver: {
      method: "PUT",
      path: "/:id",
      args: (req) => [req.params.id, req.body, req.query]
    }
  }
];

export const remove = [
  function remove(ctx, key, opts) {
    check(key, ["string","truthy"], "Expecting non-empty string for key");
    return saveWrapper(this, ctx, { _deleted: true }, [key,opts], throwIfMissing);
  }, {
    httpserver: {
      method: "DELETE",
      path: "/:id",
      args: (req) => [req.params.id, req.query]
    }
  }
];