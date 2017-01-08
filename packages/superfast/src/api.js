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

      this.models[model.name] = model;
      model.init(this);
      this.emit("model", model);
      return model;
    }

    throw new Error("Expecting model name or an object of config");
  }

  backend(name, backend) {
    check(name, "string", "Expecting string for name");
    
    if (typeof backend === "object" && backend != null) {
      this.backends[name] = backend;
    }
    
    return this.backends[name];
  }
}

Object.assign(API.prototype, EventEmitter.prototype);
