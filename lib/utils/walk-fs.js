import {flatten,without,includes} from "lodash";
import fs from "fs-promise";
import path from "path";
import ignore from "./ignore.js";

export default function walk(root, igfile) {
	let dive = (dir) => {
		return fs.readdir(path.resolve(root, dir)).then(function(files) {
			let p = [];

			// grab ignore for just this folder
			if (includes(files, igfile)) {
				files = without(files, igfile);
				p.push(fs.readFile(path.resolve(root, dir, igfile), {
					encoding: "utf-8"
				}).catch(() => "").then((src) => {
					return ignore().addPattern(src.split(/\r?\n/g));
				}));
			}

			// descend into each file/folder
			p.push(Promise.all(files.map((f) => {
				let rel = path.join(dir, f);
				return fs.stat(path.resolve(root, rel)).then(stat => {
					if (stat.isDirectory()) {
						return dive(rel).then((files) => {
							return files.map(_f => path.join(f, _f));
						});
					}

					if (stat.isFile()) return f;
				});
			})));

			// process files with ignore
			return Promise.all(p).then((r) => {
				let i, files;
				if (r.length === 1) files = r[0];
				else [i,files] = r;

				files = flatten(files).filter(Boolean);
				if (i) files = i.filter(files);
				return files;
			});
		});
	};

	return dive(".");
}
