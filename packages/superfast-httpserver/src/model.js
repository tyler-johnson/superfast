import {split as splitPath} from "superfast-util-path";
import {MissingError} from "superfast-error";

export default async function(model, req, res, next) {
  const segments = splitPath(req.path);
  if (segments[0] !== model.name || segments.length > 2) return next();

  const id = segments[1];
  const type = req.method === "GET" ? id ? "get" : "query" :
    req.method === "POST" && !id ? "create" :
    req.method === "PUT" && id ? "update" :
    req.method === "DELETE" && id ? "delete" : null;

  if (type == null) return next();

  const {query,user} = req;
  const ctx = model.context(user);
  let output;

  switch (type) {
    case "query":
      output = await ctx.query(query);
      break;
    case "get": {
      const doc = await ctx.get(id, query);
      if (doc == null) throw new MissingError(`No ${model.name} exists with provided id.`);
      output = doc;
      break;
    }
    case "create":
      output = await ctx.create(req.body, query);
      break;
    case "update":
      output = await ctx.update(req.body, id, query);
      break;
    case "delete":
      output = await ctx.delete(id, query);
      break;
    default:
      return next();
  }

  const event = model.createEvent("response", { user });
  res.json(await model.reduceEvent(event, function(m, fn) {
    return fn.call(this, event, m, query);
  }, output));
}
