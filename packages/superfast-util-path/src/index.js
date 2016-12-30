export const sep = "/";

export function split(path) {
  if (typeof path !== "string") return [];

  return path.split(sep)
    .filter(p => p && p !== ".")
    .reduce((m, p) => {
      if (p !== ".." || !m.length || m[m.length-1] === "..") m.push(p);
      else m.pop();
      return m;
    }, []);
}

export function normalize(path) {
  return split(path).join(sep);
}

export function join(...parts) {
  return parts.map(normalize).filter(Boolean).join(sep);
}

export function resolve(...parts) {
  return parts.reduce((r, path) => {
    path = split(path);

    while (path[0] === ".." && r.length && r[r.length-1] !== "..") {
      r.pop();
      path.shift();
    }

    return r.concat(path);
  }, []).join(sep);
}
