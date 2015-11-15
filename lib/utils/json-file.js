import fs from "fs-promise";

export function read(file, reviver) {
	return fs.readFile(file, { encoding: "utf-8" }).catch(function(e) {
		if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
	}).then(function(src) {
		return src ? JSON.parse(src, reviver) : {};
	});
}

export function write(file, data, replacer, space) {
	let src = JSON.stringify(data, replacer, space);
	return fs.writeFile(file, src);
}
