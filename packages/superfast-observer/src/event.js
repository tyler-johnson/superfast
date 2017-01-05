import {assign} from "lodash";
import {check} from "superfast-util-check";

export default class Event {
  constructor(target, type, data) {
    if (data) assign(this, data);
    this.target = target;
    this.type = type;
    this.bubbles = true;
    this.stopped = false;
    this.defaultPrevented = false;
  }

  static isEvent(e) {
    return e instanceof Event;
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

  async reduce(fn, memo) {
    check(fn, "function", "Expecting function to reduce with.");

    let observer = this.target;
    while (observer && !this.stopped && this.bubbles) {
      const fns = observer._observerListeners[this.type];

      if (fns != null && fns.length) {
        for (let i = 0; i < fns.length; i++) {
          if (this.stopped) break;
          memo = await fn.call(observer, memo, fns[i], this);
        }
      }

      observer = observer._observerParent;
    }

    if (!this.defaultPrevented && this.defaultListener) {
      memo = await fn.call(this, memo, this.defaultListener, this);
    }

    return memo;
  }
}
