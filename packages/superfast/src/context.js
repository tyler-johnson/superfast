import {assign} from "lodash";

export default class Context {
  constructor(model, userCtx, evtData) {
    this.model = model;
    this.userCtx = userCtx;
    this.evtData = evtData;
  }

  static isContext(ctx) {
    return ctx instanceof Context;
  }

  mixin(data) {
    assign(this.evtData, data);
    return this;
  }

  eventData(mixin) {
    return {
      ...this.evtData,
      ...mixin,
      model: this.model,
      context: this,
      userCtx: this.userCtx
    };
  }

  fire(action, name, ...args) {
    return action.fire(action.createEvent(name, this.eventData()), ...args);
  }
}
