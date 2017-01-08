import {split as splitPath} from "superfast-util-path";
import _bodyParser from "./body-parser";
import pathToRegExp from "path-to-regexp";
import {defaults} from "superfast-util-check";

const bodyParser = _bodyParser();

function prepAction(action) {
  const {httpserver:conf} = action.options;
  if (!conf) return;

  let {method,path,args} = conf;
  method = defaults(method, "string", "get");
  path = defaults(path, "string", "/");
  args = defaults(args, "function", ()=>[]);

  const pathParams = [];
  const pathRegex = pathToRegExp(path, pathParams);

  action.httproute = {
    args,
    method: method.toUpperCase(),
    path: {
      params: pathParams,
      regexp: pathRegex,
      original: path
    }
  };
}

function prepModel(model) {
  model.on("action", prepAction);
  Object.keys(model.actions).forEach(prepAction);
}

export async function modelware(model, req, res, next) {
  const segments = splitPath(req.path);
  if (segments[0] !== model.name) return next();

  const actionKeys = Object.keys(model.actions);
  const currentPath = "/" + segments.slice(1).join("/");
  const ctx = model.context(req.user);
  
  while (actionKeys.length) {
    const action = model.actions[actionKeys.shift()];
    const {httproute:route={}} = action;
    if (route.method !== req.method) continue;

    const pathMatch = route.path.regexp.exec(currentPath);
    if (!pathMatch) continue;

    const newreq = Object.create(req);
    newreq.body = await bodyParser(req, res);
    newreq.params = route.path.params.reduce((p, {name:n}, i) => {
      p[n] = pathMatch[i + 1];
      return p;
    }, {});

    const args = await route.args.call(action, newreq, ctx);
    const result = await action.run(ctx, args);

    const resEvent = action.createEvent("response", {
      request: req,
      response: res,
      defaultListener(e, data) {
        res.json(data);
      }
    });

    action.fire(resEvent, result, res);
    return;
  }

  next();
}

export default function(api) {
  api.on("model", prepModel);
  Object.keys(api.models).forEach(prepModel);

  return function(req, res, done) {
    const models = Object.keys(api.models);

    const next = async (err) => {
      if (err) throw err;
      if (!models.length) return done();
      const model = api.models[models.shift()];
      await modelware(model, req, res, next);
    };

    next().catch(done);
  };
}