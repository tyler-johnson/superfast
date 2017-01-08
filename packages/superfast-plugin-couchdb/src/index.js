import Backend from "./backend";
import initModel from "./model";
import * as eventHandlers from "./event-handlers";

export default function(conf) {
  const backend = new Backend(conf);

  return function(api) {
    // add couchdb backend
    api.backend("couchdb", backend);

    // register event handlers used by couchdb actions
    api.registerEventHandler(eventHandlers);

    // manipulate every model to be created on the api
    api.on("model", initModel);
  };
}
