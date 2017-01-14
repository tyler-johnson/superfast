import Model from "./model";
import Observer from "superfast-observer";
import {EventEmitter} from "events";
import {check} from "superfast-util-check";

export default class API extends Observer {
  constructor(conf={}) {
    super();
    EventEmitter.call(this);
    this.conf = conf;
    this.models = {};
    this._onModel = [];
    this.backends = {};
  }

  static isAPI(api) {
    return api instanceof API;
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
      if (!Model.isModel(model)) {
        model = new Model(model);
      }

      if (this.models[model.name] != null) {
        throw new Error(`Model '${name}' already exists on API`);
      }

      this.models[model.name] = model;
      model.init(this);
      this.emit("model", model);
      this._reactModel(model);
      return model;
    }

    throw new Error("Expecting model name or an object of config");
  }

  onModel(fn) {
    check(fn, "function", "Expecting function");
    this._onModel.push(fn);
    Object.keys(this.models).forEach(k => fn.call(this, this.models[k]));
    return this;
  }

  _reactModel(model) {
    const fns = this._onModel.slice();

    while (fns.length) {
      const fn = fns.shift();
      fn.call(this, model);
    }
  }

  backend(name, backend) {
    check(name, "string", "Expecting string for name");
    
    if (typeof backend === "object" && backend != null) {
      this.backends[name] = backend;
      this.emit("backend:" + name, backend);
    }
    
    return this.backends[name];
  }
}

Object.assign(API.prototype, EventEmitter.prototype);
