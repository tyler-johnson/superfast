import {split as splitPath} from "superfast-util-path";
import bodyParser from "./body-parser";
import pathToRegExp from "path-to-regexp";

function prepAction(action) {
  const {httpserver:conf} = action.options;
  if (!conf) return;

  const routes = [];
  action.httpserver = { routes };

  Object.keys(conf).forEach(key => {
    const fn = conf[key];
    if (typeof fn !== "function") return;

    const [method,...rest] = key.split(" ");
    const pathParams = [];
    const path = rest.join(" ");
    const pathRegex = pathToRegExp(path, pathParams);

    routes.push({
      method: method.toUpperCase(),
      path: {
        params: pathParams,
        regexp: pathRegex,
        path
      },
      handle: fn
    });
  });
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
    const {httpserver={}} = action;
    const routes = [].concat(httpserver.routes).filter(Boolean);

    while (routes.length) {
      const route = routes.shift();
      if (route.method !== req.method) continue;

      const pathMatch = route.path.regexp.exec(currentPath);
      if (!pathMatch) continue;

      const newreq = Object.create(req);
      newreq.body = bodyParser(req, res);
      newreq.params = route.path.params.reduce((p, {name:n}, i) => {
        p[n] = pathMatch[i + 1];
        return p;
      }, {});

      const result = await route.handle(ctx, newreq);
      const resEvent = action.createEvent("response", {
        request: req,
        response: res,
        defaultListener(e, data) {
          res.send(data);
        }
      });

      action.fire(resEvent, result, res);
      return;
    }
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