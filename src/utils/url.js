import {startsWith} from "lodash";
import {parse,format} from "url";

export function splitPathname(...paths) {
  return paths.reduce((list, p) => {
    return p && typeof p === "string" ?
      list.concat(p.split("/").filter(Boolean)) : list;
  }, []);
}

export function joinPathname(...paths) {
  return (paths[0] && paths[0] === "/" ? "/" : "") + splitPathname(...paths).join("/");
}

export function join(...urls) {
  let out = {};

  urls.forEach(url => {
    if (url && typeof url === "string") url = parse(url, true, true);
    if (typeof url !== "object" || url == null) return;
    const {protocol,host,auth,pathname,query,hash} = url;

    // overwrite completely if host is set
    if (host) out = {protocol,host,auth,pathname,query,hash};

    // otherwise merge
    else {
      if (pathname) out.pathname = joinPathname(out.pathname, pathname);
      if (query) out.query = { ...out.query, ...query };
      if (hash) out.hash = hash;
    }
  });

  return format(out);
}

// returns true if b can be found in a
export function contains(a={}, b={}) {
  if (typeof a === "string") a = parse(a, false, true);
  if (typeof b === "string") b = parse(b, false, true);

  return a.protocol === b.protocol &&
    a.host === b.host  &&
    startsWith(a.pathname || "", b.pathname || "");
}
