import Backend from "./backend";
import initModel from "./model";
import * as eventHandlers from "./event-handlers";
import attachRouter from "./router";

export default function(conf) {
  const backend = new Backend(conf);

  return function(api) {
    // add couchdb backend
    api.backend("couchdb", backend);

    // register event handlers used by couchdb actions
    api.registerEventHandler(eventHandlers);

    // manipulate every model to be created on the api
    api.onModel(initModel);

    // attach db proxy routes
    api.on("router", attachRouter);
  };
}
