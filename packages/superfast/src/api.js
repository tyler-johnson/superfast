import Model from "./model";
import CouchDBManager from "./manager";
import EventEmitter from "superfast-eventemitter";
import {check} from "superfast-util-check";

export default class API extends EventEmitter {
  constructor(conf={}) {
    super();
    this.conf = conf;
    this.models = {};
    this._auths = [];
    this.couchdbs = new CouchDBManager(this.conf);
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
}
