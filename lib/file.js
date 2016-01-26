import {includes,isArray} from "lodash";
import confusedAsync from "./utils/confused-async";
import fs from "fs-promise";

export class Source {
	constructor(compiler, fpath) {
		this.compiler = compiler;
		this.path = fpath;
		this.type = null;
		this.targets = [];
		this.removed = false;
	}

	setType(type) {
		this.type = type;
		return this;
	}

	target(v) {
		if (!isArray(v)) v = v != null ? [v] : [];
		this.targets = v;
		return this;
	}

	isTarget(t) {
		return includes(this.targets, t);
	}
}

export class File extends Source {
	get fullpath() {
		return this.compiler.resolve(this.path);
	}

	transform(options) {
		options = options || {};
		let rev;

		return Promise.all([
			this.fetch(),
			fs.stat(this.fullpath).catch((e) => {
				if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
			})
		]).then(r => {
			let [doc,stat] = r;

			// set removed state from stat info
			this.removed = !stat;

			// no need to transform a missing file
			if (this.removed) return;

			// no need to transform a perfectly good cached version
			if (!options.force && doc && stat.mtime <= doc.timestamp) {
				rev = doc._rev;
				this.target(doc.targets);
				this.setType(doc.type);
				return;
			}

			// get source and transform
			return fs.readFile(this.fullpath, {
				encoding: "utf-8"
			}).then(src => {
				let fns = this.compiler.transforms.slice(0);
				let next = (s) => {
					if (s != null) src = s;
					if (this.removed) return Promise.resolve();
					if (!fns.length) return Promise.resolve(src);
					return confusedAsync(fns.shift(), this.compiler, [ this, src ]).then(next);
				};

				return next();
			});
		}).then((src) => {
			if (this.removed) return this.delete(rev);
			if (typeof src === "string") return this.save(src);
		});
	}

	getSource() {
		return this.compiler.database.getAttachment(this.path, "data").then((src) => {
			return src.toString("utf-8");
		});
	}

	fetch() {
		return this.compiler.database.get(this.path).catch(e => {
			if (e.status !== 404) throw e;
		}).then(doc => {
			if (!doc) return;
			doc.timestamp = new Date(doc.timestamp);
			return doc;
		});
	}

	save(src) {
		let doc = {
			_id: this.path,
			_attachments: {
				"data": {
					"content_type": "text/plain",
					"data": new Buffer(src, "utf-8")
				}
			},
			timestamp: new Date(),
			type: this.type,
			targets: this.targets
		};

		// using allDocs() over a normal get() because we only need
		// the latest revision, not the whole document
		return this.compiler.database.allDocs({
			key: this.path,
			limit: 1
		}).then(res => {
			if (res && res.rows.length) {
				doc._rev = res.rows[0].value.rev;
			}

			return this.compiler.database.put(doc);
		});
	}

	delete(rev) {
		let p;
		if (!rev) p = this.fetch().then(d => d._rev);
		else p = Promise.resolve(rev);

		return p.then(rev => {
			return this.compiler.database.remove(this.path, rev).catch(e => {
				if (e.status !== 404) throw e;
			});
		});
	}
}

export class Module extends Source {

}
