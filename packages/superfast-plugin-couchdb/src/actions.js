import {MissingError} from "superfast-error";

export const query = [
  async function query(ctx, opts) {
    await ctx.model.fire("setup");
    await ctx.fire(this, "validate", null, opts);

    let res = await ctx.fire(this, "handle", opts);
    if (Array.isArray(res)) res = { rows: res };
    else if (res == null || !Array.isArray(res.rows)) res = { rows: [] };

    const rowscopy = new Array(res.rows.length);
    for (let i = 0; i < res.rows.length; i++) {
      rowscopy[i] = await ctx.fire(this, "transform", res.rows[i], null, opts);
    }

    return {
      total_rows: res.total_rows != null ? res.total_rows : res.rows.length,
      rows: rowscopy
    };
  }, {
    httpserver: {
      "GET /": function(ctx, req) {
        return ctx.query(req.query);
      }
    }
  }
];

export const get = [
  async function get(ctx, id, opts) {
    await ctx.model.fire("setup");
    await ctx.fire(this, "validate", id, opts);
    let res = await ctx.fire(this, "handle", id, opts);
    return await ctx.fire(this, "transform", res, id, opts);
  }, {
    httpserver: {
      "GET /:id": async function(ctx, req) {
        const doc = await ctx.get(req.params.id, req.query);
        if (doc == null) throw new MissingError(`No ${ctx.model.name} exists with provided id.`);
        return doc;
      }
    }
  }
];

export async function create(ctx, doc, opts) {
  await ctx.model.fire("setup");
  await ctx.fire(this, "validate", null, opts);
  doc = await ctx.fire(this, "normalize", doc, null, opts);
  let res = await ctx.fire(this, "handle", doc, opts);
  return await ctx.fire(this, "transform", res, null, opts);
}

export async function update(ctx, id, doc, opts) {
  if (typeof id === "object" && id._id) {
    [opts,doc,id] = [doc,id,id._id];
  }

  await ctx.model.fire("setup");
  await ctx.fire(this, "validate", id, opts);
  doc = await ctx.fire(this, "normalize", doc, id, opts);
  let res = await ctx.fire(this, "handle", doc, id, opts);
  return await ctx.fire(this, "transform", res, id, opts);
}

export async function remove(ctx, id, opts) {
  await ctx.model.fire("setup");
  await ctx.fire(this, "validate", id, opts);
  let res = await ctx.fire(this, "handle", id, opts);
  return await ctx.fire(this, "transform", res, id, opts);
}