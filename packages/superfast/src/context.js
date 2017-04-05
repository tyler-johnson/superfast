export default class Context {
  constructor(model, evtData) {
    this.model = model;
    this.evtData = evtData;
  }

  static isContext(ctx) {
    return ctx instanceof Context;
  }

  mixin(data) {
    Object.assign(this.evtData, data);
    return this;
  }

  eventData(mixin) {
    return {
      ...this.evtData,
      ...mixin,
      model: this.model,
      context: this
    };
  }

  createEvent(action, name, evtData) {
    return action.createEvent(name, this.eventData(evtData));
  }

  fire(action, name, ...args) {
    return action.fire(this.createEvent(action, name), ...args);
  }
}
