import express from "express";
// import authProxy from "./authproxy";
// import bodyParser from "./body-parser";
import handleErrors from "./errors";
import {NoRouteError} from "superfast-error";
import installModelAPIs from "./model";

function responseEvent(event, data, res) {
  return event.reduce((m, fn, ob) => {
    return fn.call(ob, event, m, res);
  }, data);
}

export default function() {
  return function(api) {
    api.onModel(installModelAPIs);
    api.registerEventHandler("response", responseEvent);

    api.createRouter = function() {
      const router = express();
      this.emit("router", router);

      // core model routes
      api.onModel((m) => m.installRouter(router));

      // handle errors
      router.use(() => { throw new NoRouteError(); });
      router.use(handleErrors);

      return router;
    };

    api.listen = function(port, cb) {
      if (typeof port === "function") {
        [cb,port] = [port,null];
      }

      if (port == null) port = this.conf.port || 3000;

      return this.createRouter().listen(port, cb);
    };
  };
}
