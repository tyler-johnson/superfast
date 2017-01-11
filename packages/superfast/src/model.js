import {check} from "superfast-util-check";
import {compile} from "kontur";
import Ajv from "ajv";
import Observer from "superfast-observer";
import Action from "./action";
import Context from "./context";
import {EventEmitter} from "events";

export default class Model extends Observer {
  constructor(conf={}) {
    super();
    EventEmitter.call(this);

    this.conf = conf;
    this._onAction = [];

    Object.defineProperty(this, "name", {
      value: check(conf.name, ["string","truthy"], "Expecting non-empty string for model name."),
      writeable: false,
      configurable: false,
      enumerable: true
    }); 

    if (conf.schema) {
      const ajv = new Ajv({
        useDefaults: true,
        removeAdditional: "all"
      });

      this.schema = ajv.compile(compile(conf.schema));
    }
  }

  static isModel(m) {
    return m instanceof Model;
  }

  init(api) {
    check(this.api, "empty", "This model has already been initiated with an API.");
    this._observerParent = this.api = api;
    this.emit("mount", api);
    return this;
  }

  actions = {};

  action(name, fn, opts) {
    if (name && typeof name === "object") {
      return Object.keys(name).reduce((m, n) => {
        m[n] = this.action(n, ...[].concat(name[n]));
        return m;
      }, {});
    }

    check(name, ["string","truthy"], "Expecting non-empty string for action name.");

    if (typeof fn === "function") {
      if (this.actions[name] != null) {
        throw new Error(`Action '${name}' already exists on the model '${this.name}'`);
      }
      
      const action = this.actions[name] = new Action(this, name, fn, opts);
      this.emit("action", action);
      this._reactAction(action);
    }

    return this.actions[name];
  }
  
  onAction(fn) {
    check(fn, "function", "Expecting function");
    this._onAction.push(fn);
    Object.keys(this.actions).forEach(k => fn.call(this, this.actions[k]));
    return this;
  }

  _reactAction(action) {
    const fns = this._onAction.slice();

    while (fns.length) {
      const fn = fns.shift();
      fn.call(this, action);
    }
  }

  context(userCtx, evtData) {
    const ctx = new Context(this, userCtx, evtData);

    Object.keys(this.actions).forEach(k => {
      if (k in ctx) return;

      const action = this.actions[k];
      const run = function(...args) {
        return action.run(this, args);
      };

      Object.defineProperty(ctx, k, {
        value: run,
        writable: false,
        enumerable: true,
        configurable: false
      });
    });

    this.emit("context", ctx);
    return ctx;
  }
}

Object.assign(Model.prototype, EventEmitter.prototype);