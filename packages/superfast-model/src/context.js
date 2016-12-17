import {defaults} from "./utils/check";

export default class Context {
  constructor(model, data={}) {
    this.model = model;
    this.id = defaults(data.id, ["string","truthy"], null);
    this.params = defaults(data.params, ["object","truthy"], {});
    this.user = defaults(data.user, "object", null);
  }

  param(name) {
    return this.params[name];
  }
}