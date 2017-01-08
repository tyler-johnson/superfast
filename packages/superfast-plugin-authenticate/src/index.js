
function authHandler(event, auth) {
  return event.reduce(async function(m, fn, ob) {
    const val = await fn.call(ob, event, auth);
    if (val != null) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return val;
    }
  });
}

function authenticate(auth) {
  return this.fire("authenticate", auth);
}

function router(r) {
  r.use((req, res, next) => {
    const auth = req.get("authorization");
    if (!auth) return next();

    this.authenticate(auth)
      .then((result={}) => (req.user = result))
      .then(() => next())
      .catch(next);
  });
}

export default function() {
  return function(api) {
    api.registerEventHandler("authenticate", authHandler);
    api.authenticate = authenticate;
    api.on("router", router);
  };
}