import {ExistsError,MissingError} from "superfast-error";

export async function query(e, opts={}) {
  const {view,include_docs,descending,key,keys} = e.model.conf.query || {};
  const {limit,skip} = opts;
  const getdoc = !view || include_docs;

  const qopts = {
    descending, limit, skip,
    include_docs: getdoc,
    key: typeof key === "function" ? key(opts) : void 0,
    keys: typeof keys === "function" ? keys(opts) : void 0
  };

  let {total_rows,rows} = await (view ? e.model.db.query(view, qopts) : e.model.db.allDocs(qopts));
  rows = rows.map(r => getdoc ? r.doc : r.value);
  if (getdoc) rows = rows.filter(r => r._id && r._id.substr(0,8) !== "_design/");

  return { total_rows, rows };
}

export async function get(e, id, opts={}) {
  const {view,include_docs,descending,key,keys} = e.model.conf.query || {};
  const getdoc = !view || include_docs;

  const qopts = {
    descending,
    include_docs: getdoc,
    limit: 1,
    key: typeof key === "function" ? key(id, opts) : id,
    keys: typeof keys === "function" ? keys(id, opts) : void 0
  };

  const {rows} = await (view ? e.model.db.query(view, qopts) : e.model.db.allDocs(qopts));

  return rows.length ? rows[0][getdoc ? "doc" : "value"] : null;
}

export async function create(e, doc, opts={}) {
  if (!doc._id) {
    const {id,rev} = await e.model.db.post(doc, opts);
    return { ...doc, _id: id, _rev: rev };
  }

  const {rev} = await e.model.db.upsert(doc._id, (ex) => {
    if (ex && ex._rev) {
      throw new ExistsError(`${e.model.name} already exists with provided id.`);
    }

    return { ...doc };
  });

  return { ...doc, _rev: rev };
}

export async function update(e, doc, id) {
  const {rev} = await e.model.db.upsert(id, (ex) => {
    if (!ex || !ex._rev) {
      throw new MissingError(`No ${e.model.name} exists with provided id.`);
    }

    return { ...doc };
  });

  return { ...doc, _id: id, _rev: rev };
}

export async function remove(e, id) {
  const {rev} = await e.model.db.upsert(id, (ex) => {
    if (!ex || !ex._rev) {
      throw new MissingError(`No ${e.model.name} exists with provided id.`);
    }

    return { _deleted: true };
  });

  return { _id: id, _rev: rev, _deleted: true };
}