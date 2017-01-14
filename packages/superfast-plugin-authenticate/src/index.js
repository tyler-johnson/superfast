
function authHandler(event, auth) {
  return event.reduce(async function(m, fn, ob) {
    const val = await fn.call(ob, event, auth);
    if (typeof val !== "undefined") {
      event.stopImmediatePropagation();
      event.preventDefault();
      return val;
    }

    return auth;
  });
}

function authenticate(auth) {
  return this.fire("authenticate", auth);
}

async function middleware(req, res, next) {
  try {
    const auth = req.get("authorization");
    req.user = await this.authenticate(auth);
    next();
  } catch(e) {
    next(e);
  }
}

export default function() {
  return function(api) {
    api.registerEventHandler("authenticate", authHandler);
    api.authenticate = authenticate;
    api.on("router", (r) => r.use(middleware.bind(api)));
  };
}