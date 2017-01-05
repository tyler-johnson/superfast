import {check} from "superfast-util-check";
import {without} from "lodash";
import Event from "./event";

export {Event};

export default class Observer {
  constructor(parent) {
    this._observerParent = parent;
    this._observerHandlers = {};
    this._observerListeners = {};
  }

  static isObserver(o) {
    return o instanceof Observer;
  }

  observe(type, fn) {
    if (type && typeof type === "object") {
      Object.keys(type).forEach(k => this.observe(k, type[k]));
      return this;
    }

    check(type, ["string","truthy"], "Expecting non-empty string for event type.");
    check(fn, "function", "Expecting function for event listener.");

    if (this._observerListeners[type] == null) this._observerListeners[type] = [];
    this._observerListeners[type].push(fn);
    return this;
  }

  unobserve(type, fn) {
    if (type && typeof type === "object") {
      Object.keys(type).forEach(k => this.unobserve(k, type[k]));
      return this;
    }

    check(type, ["string","truthy"], "Expecting non-empty string for event type.");
    check(fn, "function", "Expecting function for event listener.");

    if (this._observerListeners[type] != null) {
      this._observerListeners[type] = without(this._observerListeners[type], fn);

      if (!this._observerListeners[type].length) {
        delete this._observerListeners[type];
      }
    }

    return this;
  }

  createEvent(type, data) {
    return new Event(this, type, data);
  }

  registerEventHandler(type, fn) {
    if (type && typeof type === "object") {
      Object.keys(type).forEach(k => this.registerEventHandler(k, type[k]));
      return this;
    }

    check(type, ["string","truthy"], "Expecting non-empty string for event type.");
    check(fn, "function", "Expecting function for event handler.");
    this._observerHandlers[type] = fn;
    return this;
  }

  async fire(event, ...args) {
    if (event && typeof event === "string") event = this.createEvent(event);
    check(event, Event.isEvent, "Expecting Event to emit.");

    if (this._observerHandlers[event.type]) {
      return await this._observerHandlers[event.type].call(this, event, ...args);
    }

    if (this._observerParent) {
      return await this._observerParent.fire(event, ...args);
    }

    await event.reduce(function(m, fn, ob) {
      return fn.call(ob, event, ...args);
    });
  }
}
