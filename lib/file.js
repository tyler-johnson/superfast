import {includes,isArray} from "lodash";
import confusedAsync from "./utils/confused-async";
import fs from "fs-promise";

export class Source {
	constructor(compiler, fpath) {
		this.compiler = compiler;
		this.path = fpath;
		this.type = null;
		this.targets = [];
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

	transform() {
		return fs.readFile(this.fullpath, {
			encoding: "utf-8"
		}).then(src => {
			let fns = this.compiler.transforms.slice(0);
			let next = (s) => {
				if (s != null) src = s;
				if (!fns.length) return Promise.resolve(src);
				return confusedAsync(fns.shift(), this.compiler, [ this, src ]).then(next);
			};

			return next();
		}).then((src) => {
			return this.save(src);
		});
	}

	getSource() {
		return this.compiler.database.getAttachment(this.path, "data").then((src) => {
			return src.toString("utf-8");
		});
	}

	fetch() {

	}

	save(src) {
		let doc = {
			_id: this.path,
			timestamp: new Date(),
			targets: this.targets,
			type: this.type,
			_attachments: {
				"data": {
					"content_type": "text/plain",
					"data": new Buffer(src, "utf-8")
				}
			}
		};

		// using allDocs() over a normal get() because we only need
		// the latest revision, not the whole document
		return this.compiler.database.allDocs({
			key: this.path,
			limit: 1
		}).catch(e => {
			if (e.status !== 404) throw e;
		}).then(res => {
			if (res && res.rows.length) {
				doc._rev = res.rows[0].value.rev;
			}

			return this.compiler.database.put(doc);
		});
	}
}

export class Module extends Source {

}
