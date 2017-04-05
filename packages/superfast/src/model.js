import {check} from "superfast-util-check";
import Observer from "superfast-observer";
import Action from "./action";
import Context from "./context";
import {EventEmitter} from "events";
import API from "./api";

function MergeClass(Parent, ...inherits) {
  class Child extends Parent {
    constructor(...args) {
      super(...args);
      inherits.forEach(I => I.call(this));
    }
  }

  inherits.forEach(I => {
    Object.assign(Child.prototype, I.prototype);
  });

  return Child;
}

export default class Model extends MergeClass(Observer, EventEmitter) {
  constructor(conf={}) {
    super();
    this.conf = conf;

    Object.defineProperty(this, "name", {
      value: check(conf.name, ["string","truthy"], "Expecting non-empty string for model name."),
      writeable: false,
      configurable: false,
      enumerable: true
    });
  }

  static isModel(m) {
    return m instanceof Model;
  }

  mount(parent) {
    check(this._observerParent, "empty", "This model has already been mounted to a parent.");

    if (Model.isModel(parent)) {
      this.api = parent.api;
    } else if (API.isAPI(parent)) {
      this.api = parent;
    } else {
      throw new Error("Expecting model or api for parent");
    }

    this._observerParent = parent;
    this.emit("mount", parent);
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

  _onAction = [];
  
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

  context(evtData) {
    const ctx = new Context(this, evtData);

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