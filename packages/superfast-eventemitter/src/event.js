import {assign} from "lodash";

export default class Event {
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
