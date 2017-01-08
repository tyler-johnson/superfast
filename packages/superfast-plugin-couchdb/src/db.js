
export function pouchOpts(single=false, q, id, opts) {
  const {view,include_docs=true,descending=false,key,keys} = q;
  const {limit,skip} = opts || {};

  const qopts = {
    single, view, descending,
    include_docs: !view || include_docs,
    limit: single ? 1 : limit,
    skip: single ? 0 : skip
  };

  if (typeof key === "function") qopts.key = key(id, opts);
  else if (typeof keys === "function") qopts.keys = keys(id, opts);
  else if (id) qopts.key = id;

  return qopts;
}

export async function query(db, o={}) {
  const {view,...opts} = o;
  return await (view ? db.query(view, opts) : db.allDocs(opts));
}

export async function fetch(db, o={}) {
  const {transform,single,...opts} = o;

  if (single && opts.include_docs) {
    try {
      return opts.key ? await db.get(opts.key) : null;
    } catch(e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  const {total_rows,rows} = await query(db, opts);
  const tr = transform || ((r) => opts.include_docs ? r.doc : r.value);
  
  if (single) {
    return rows.length ? tr(rows[0]) : null;
  } else {
    return { total_rows, rows: rows.map(tr) };
  }
}

export async function save(db, opts, fn) {
  const prev = await fetch(db, {
    ...opts,
    single: true,
    include_docs: true
  });

  const doc = await fn(prev);
  if (!doc) return;

  const out = !prev ? doc : {
    ...doc,
    _id: prev._id,
    _rev: prev._rev
  };

  const {id,rev} = await db[out._id ? "put" : "post"](out);
  return { ...doc, _id: id, _rev: rev };
}

