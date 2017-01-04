import Lifecycle from "./lifecycle";
import Action from "./action";
import {check} from "superfast-util-check";

export default class Context {
  constructor(model, userCtx, evtData) {
    this.model = model;
    this.userCtx = userCtx;
    this.evtData = evtData;
  }

  static isContext(ctx) {
    return ctx instanceof Context;
  }

  lifecycle(action) {
    if (typeof action === "string") action = this.model.getAction(action);
    check(action, Action.isAction, "Expecting action to create lifecycle from.");
    return new Lifecycle(action, this);
  }
}
