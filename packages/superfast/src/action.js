import Observer from "superfast-observer";
import {check} from "superfast-util-check";

export default class Action extends Observer {
  constructor(model, name, fn) {
    super(model);
    check(name, "string", "Expecting string for action name.");
    check(fn, "function", "Expecting function for action method.");

    this.name = name;
    this.model = model;
    this._fn = fn;
  }

  static isAction(a) {
    return a instanceof Action;
  }

  run(ctx, args) {
    return this._fn.call(this, ctx, ...args);
  }

  createEvent(type, data) {
    return Observer.prototype.createEvent.call(this, type, {
      ...data,
      action: this.name
    });
  }
}
