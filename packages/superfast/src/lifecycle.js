import {assign} from "lodash";

export default class Lifecycle {
  constructor(action, context) {
    if (context.model !== action.model) {
      throw new Error("Incompatible action and context models");
    }

    this.model = context.model;
    this.context = context;
    this.action = action;
    this.evtData = {};
  }

  static isLifecycle(l) {
    return l instanceof Lifecycle;
  }

  mixin(data) {
    assign(this.evtData, data);
    return this;
  }

  createEvent(name, mixin) {
    return this.action.createEvent(name, {
      ...this.context.evtData,
      ...this.evtData,
      ...mixin,
      action: this.action.name,
      model: this.model,
      context: this.context,
      userCtx: this.context.userCtx
    });
  }

  emitEvent(...args) { return this.action.emitEvent(...args); }
  reduceEvent(...args) { return this.action.reduceEvent(...args); }

  async emit(name, ...args) {
    const event = this.createEvent(name);

    const handler = this.model._lifecycle[name];
    if (handler) return await handler.call(this, event, ...args);

    await this.emitEvent(event, ...args);
  }
}
