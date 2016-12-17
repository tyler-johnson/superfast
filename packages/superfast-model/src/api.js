import Model from "./model";
import CouchDBManager from "./manager";
import express from "express";

export default class API {
  constructor(conf={}) {
    this.conf = {
      port: 3000,
      ...conf
    };

    this.models = {};
    this.couchdbs = new CouchDBManager(this);
    this._setupRouter();
  }

  model(model) {
    if (typeof model === "string") {
      return this.models[model];
    }

    if (typeof model == "object" && model != null) {
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

  _setupRouter() {
    const app = this.router = express();

    const load = this.load();
    app.use((req, res, next) => {
      load.then(() => next(), next);
    });

    app.use(this.couchdbs.router());
    app.use(this._modelRouter);
  }

  _modelRouter = (req, res, done) => {
    const models = Object.keys(this.models);

    const next = async (err) => {
      if (err) return done(err);
      if (!models.length) return done();
      const model = this.models[models.shift()];

      try {
        await model.handle(req, res, next);
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

    return this.router.listen(port, cb);
  }
}
