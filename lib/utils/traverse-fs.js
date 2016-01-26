import {flatten,without,includes} from "lodash";
import fs from "fs-promise";
import path from "path";
import ignore from "./ignore.js";

function getIgnoreFile(p) {
	return fs.readFile(p, {
		encoding: "utf-8"
	}).catch(() => "").then((src) => {
		return ignore().addPattern(src.split(/\r?\n/g));
	});
}

function getIgnoreFileSync(p) {
	let src;
	try { src = fs.readFileSync(p, { encoding: "utf-8" }); }
	catch(e) { src = ""; }
	return ignore().addPattern(src.split(/\r?\n/g));
}

// gets all files in a folder that aren't ignored
export function traverse(root, igfile) {
	let dive = (dir) => {
		return fs.readdir(path.resolve(root, dir)).then(function(files) {
			let p = [];

			// grab ignore for just this folder
			if (includes(files, igfile)) {
				files = without(files, igfile);
				p.push(getIgnoreFile(path.resolve(root, dir, igfile)));
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

// tests a file within root to see if it should be ignored
export function test(file, root, igfile) {
	file = path.relative(root, path.resolve(root, file));

	// outside of this folder is undefined behavior
	if (/^\.\.\//.test(file)) return;

	// root is always good
	file = file.split("/");
	if (!file.length) return true;

	let localname = [];

	// run through directories testing ignores
	let next = () => {
		// no more file parts? this file is OK
		if (!file.length) return true;

		// shift file name parts
		localname.unshift(file.pop());
		let rel = localname.join("/");

		// test each local name to each ignore file
		let i = getIgnoreFileSync(path.join(root, file.join("/"), igfile));
		if (i && !i._filter(rel)) return false;

		return next();
	};

	return next();
}
