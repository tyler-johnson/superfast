import Model from "./model";
import CouchDBManager from "./manager";
import express from "express";
import {router as handleErrors,NoRouteError} from "./error";
import * as routerUtils from "./utils/router";
import EventEmitter from "./eventemitter";
import {check} from "./utils/check";

export default class API extends EventEmitter {
  constructor(conf={}) {
    super();
    this.conf = {
      port: 3000,
      ...conf
    };

    this.models = {};
    this._auths = [];
    this.couchdbs = new CouchDBManager(this);
  }

  use(fn) {
    fn.call(this, this);
    return this;
  }

  model(model) {
    if (typeof model === "string") {
      return this.models[model];
    }

    if (typeof model === "object" && model != null) {
      if (!(model instanceof Model)) {
        model = new Model(model);
      }

      this.models[model.name] = model;
      model.init(this);
      return model;
    }

    throw new Error("Expecting model name or a model object");
  }

  load() {
    return this.couchdbs.load();
  }

  createRouter() {
    const app = express();

    const load = this.load();
    app.use((req, res, next) => {
      load.then(() => next(), next);
    });

    app.use(this.couchdbs.router());
    app.use(routerUtils.requestParser());
    app.use(this._authRouter);
    app.use(this._modelRouter);
    app.use((req, res, next) => next(new NoRouteError()));
    app.use(handleErrors);

    return app;
  }

  _modelRouter = (req, res, done) => {
    const models = Object.keys(this.models);

    const next = async (err) => {
      if (err) return done(err);
      if (!models.length) return done();
      const model = this.models[models.shift()];

      try {
        await model.handleRequest(req, res, next);
      } catch(e) {
        return done(e);
      }
    };

    next();
  }

  listen(port, cb) {
    if (typeof port === "function" && cb == null) {
      [cb,port] = [port,null];
    }

    if (port == null) {
      port = this.conf.port;
    }

    const app = this.createRouter();
    return app.listen(port, cb);
  }

  authenticate = (auth) => {
    const auths = this._auths.slice(0);
    const next = (err) => {
      if (err) return Promise.reject(err);
      if (!auths.length) return Promise.resolve();

      try {
        return Promise.resolve(auths.shift().call(this, auth, next));
      } catch(e) {
        return next(e);
      }
    };

    return next();
  }

  registerAuth(a) {
    check(a, "function", "Expecting authentication function.");
    this._auths.push(a);
    return this;
  }

  _authRouter = (req, res, next) => {
    this.authenticate(req.get("authorization")).then(r => {
      req.user = r || {};
      next();
    }).catch(next);
  }
}
