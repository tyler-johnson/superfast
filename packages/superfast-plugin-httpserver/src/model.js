import {normalize as normalizePath} from "superfast-util-path";
import _bodyParser from "./body-parser";
import {Router} from "express";
import {defaults} from "superfast-util-check";

const bodyParser = _bodyParser();

function addActionRouter(action, router) {
  const {httpserver:conf} = action.options;
  if (!conf) return;

  let {method,path,args:getArgs} = conf;
  method = defaults(method, "string", "get");
  path = defaults(path, "string", "/");
  getArgs = defaults(getArgs, "function", ()=>[]);

  router[method.toLowerCase()](path, async function(req, res, next) {
    try {
      await bodyParser(req, res);
      const args = await getArgs.call(action, req, req.context);
      const result = await action.run(req.context, args);

      const resEvent = action.createEvent("response", {
        request: req,
        response: res,
        defaultListener(e, data) {
          res.json(data);
        }
      });

      await action.fire(resEvent, result, res);
    } catch(e) {
      next(e);
    }
  });
}

function attachContext(model) {
  return function(req, res, next) {
    req.context = model.context(req.user || {});
    next();
  };
}

function createModelRouter() {
  const router = new Router();
  router.use(attachContext(this));
  this.emit("router", router);
  this.onAction((a) => addActionRouter(a, router));
  return router;
}

function installRouter(app) {
  const mount = normalizePath(this.conf.mountpath || this.name);
  app.use("/" + mount, this.createRouter());
}

export default function prepModel(model) {
  model.createRouter = createModelRouter;
  model.installRouter = installRouter;
}
