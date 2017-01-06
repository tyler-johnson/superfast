import express from "express";
// import authProxy from "./authproxy";
// import bodyParser from "./body-parser";
import handleErrors from "./errors";
import {NoRouteError} from "superfast-error";
import createModelRouter from "./model";

export default function() {
  return function(api) {
    const modelRouter = createModelRouter(api);
    
    api.createRouter = function() {
      const router = express();
      this.emit("router", router);

      // // create auth proxies for database that are missing proxy info
      // const manager = api.couchdbs;
      // const authProxies = manager.databases.reduce((proxies, db) => {
      //   if (!db.privateOnly && !db._proxyUrl) {
      //     proxies[db.id] = authProxy({
      //       target: db._url,
      //       authenticate: api.authenticate
      //     });
      //   }

      //   return proxies;
      // }, {});

      // // database auth proxies
      // router.use("/:dbid", function(req, res, next) {
      //   if (authProxies[req.params.dbid]) {
      //     authProxies[req.params.dbid](req, res, next);
      //   } else {
      //     next();
      //   }
      // });

      // // authenticate requests
      // router.use(function(req, res, next) {
      //   api.authenticate(req.get("authorization")).then(r => {
      //     req.user = r || {};
      //     next();
      //   }).catch(next);
      // });

      // core model routes
      router.use(modelRouter);

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
