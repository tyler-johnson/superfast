import {check} from "./utils/check";
import {assign,without} from "lodash";

export class Event {
  constructor(target, type, data) {
    if (data) assign(this, data);
    this.target = target;
    this.type = type;
    this.bubbles = true;
    this.stopped = false;
    this.defaultPrevented = false;
  }

  stopPropagation() {
    this.bubbles = false;
    return this;
  }

  stopImmediatePropagation() {
    this.stopped = true;
    return this;
  }

  preventDefault() {
    this.defaultPrevented = true;
    return this;
  }

  static isEvent(e) {
    return e instanceof Event;
  }
}

export default class EventEmitter {
  constructor(parent) {
    this._eventParent = parent;
    this._events = {};
  }

  addListener(type, fn) {
    if (type && typeof type === "object") {
      Object.keys(type).forEach(k => this.addListener(k, type[k]));
      return this;
    }

    check(type, ["string","truthy"], "Expecting non-empty string for event type.");
    check(fn, "function", "Expecting function for event listener.");

    if (this._events[type] == null) this._events[type] = [];
    this._events[type].push(fn);
    return this;
  }

  removeListener(type, fn) {
    check(type, ["string","truthy"], "Expecting non-empty string for event type.");
    check(fn, "function", "Expecting function for event listener.");

    if (this._events[type] != null) {
      this._events[type] = without(this._events[type], fn);

      if (!this._events[type].length) {
        delete this._events[type];
      }
    }

    return this;
  }

  createEvent(type, data) {
    return new Event(this, type, data);
  }

  listenerCount(event) {
    check(event, [Event.isEvent,"string"], "Expecting event or event type.");
    const fns = this._events[typeof event === "string" ? event : event.type];
    return fns ? fns.length : 0;
  }

  async emitEvent(event, ...args) {
    await this.reduceEvent(event, function(m, fn) {
      fn.call(this, event, ...args);
    });
  }

  async reduceEvent(event, fn, memo) {
    check(event, Event.isEvent, "Expecting Event to emit.");
    check(fn, "function", "Expecting function to reduce with.");

    const fns = this._events[event.type];
    if (fns != null && fns.length) {
      for (let i = 0; i < fns.length; i++) {
        if (event.stopped) break;
        memo = await fn.call(this, memo, fns[i], event);
      }
    }

    if (!event.stopped && event.bubbles && this._eventParent) {
      memo = await this._eventParent.reduceEvent(event, fn, memo);
    } else if (!event.defaultPrevented && event.defaultListener) {
      memo = await fn.call(this, memo, event.defaultListener, event);
    }

    return memo;
  }
}
