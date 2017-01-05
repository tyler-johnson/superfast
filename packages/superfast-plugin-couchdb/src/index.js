import Backend from "./backend";
import * as events from "./events";
import initModel from "./model";

export default function(conf) {
  const backend = new Backend(conf);

  return function(api) {
    // add couchdb backend
    api.backend("couchdb", backend);

    // register event handlers: validate, transform, etc.
    api.registerEventHandler(events);

    // manipulate every model to be created on the api
    api.on("model", initModel);
  };
}
