
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

async function middleware(req, res, next) {
  try {
    const auth = req.get("authorization");
    if (!auth) return next();

    const result = await this.authenticate(auth);
    if (req.context) req.context.setUserCtx(result);
    req.user = result;
    next();
  } catch(e) {
    next(e);
  }
}

export default function() {
  return function(api) {
    api.registerEventHandler("authenticate", authHandler);
    api.authenticate = authenticate;
    api.on("router", (r) => r.use(middleware));
  };
}