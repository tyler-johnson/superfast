import EventEmitter from "superfast-eventemitter";
import {check} from "superfast-util-check";

export default class Action extends EventEmitter {
  constructor(model, name, fn) {
    super(model);
    check(name, "string", "Expecting string for action name.");
    check(fn, "function", "Expecting function for action method.");

    this.model = model;
    this._fn = fn;
  }

  static isAction(a) {
    return a instanceof Action;
  }

  run(ctx, args) {
    return this._fn.apply(ctx.lifecycle(this), args);
  }
}
