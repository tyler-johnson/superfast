import {check} from "./utils/check";
import {assign,without} from "lodash";

class Event {
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

  addListener(name, fn) {
    check(name, ["string","truthy"], "Expecting non-empty string for event name.");
    check(fn, "function", "Expecting function for event listener.");

    if (this._events[name] == null) this._events[name] = [];
    this._events[name].push(fn);
    return this;
  }

  removeListener(name, fn) {
    check(name, ["string","truthy"], "Expecting non-empty string for event name.");
    check(fn, "function", "Expecting function for event listener.");

    if (this._events[name] != null) {
      this._events[name] = without(this._events[name], fn);

      if (!this._events[name].length) {
        delete this._events[name];
      }
    }

    return this;
  }

  createEvent(name, data) {
    return new Event(this, name, data);
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
        if (event.stopped) return memo;
        memo = await fn.call(this, memo, fns[i], event);
      }
    }

    if (event.bubbles && this._eventParent) {
      memo = await this._eventParent.reduceEvent(event, fn, memo);
    } else if (!event.defaultPrevented && event.defaultListener) {
      memo = await fn.call(this, memo, event.defaultListener, event);
    }

    return memo;
  }
}