import Model from "./model";
import Observer from "superfast-observer";
import {EventEmitter} from "events";
import {assign} from "lodash";

export default class API extends Observer {
  constructor(conf={}) {
    super();
    EventEmitter.call(this);
    this.conf = conf;
    this.models = {};
    this._auths = [];
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
      model = new Model(this, model);
      this.models[model.name] = model;
      this.emit("model", model);
      return model;
    }

    throw new Error("Expecting model name or an object of config");
  }

  load() {
    if (this._loaded) return Promise.resolve();

    if (!this._loading) {
      this._loading = this.fire("load").then(r => {
        this._loaded = true;
        return r;
      });
    }

    return this._loading;
  }

  authenticate = (auth) => {
    const event = this.createEvent("authenticate");

    return event.reduce(function(m, fn) {
      if (m != null) {
        event.stopImmediatePropagation();
        return m;
      }

      return fn.call(this, event, auth);
    });
  }
}

assign(API.prototype, EventEmitter.prototype);
