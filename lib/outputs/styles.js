import {each as eachSeries} from "../utils/promise-series.js";
import fs from "fs-promise";
import contains from "lodash/collection/contains";

export default function styles(files) {
	let buf = new Buffer(0);
	files = files.filter((f) => {
		return contains(f.targets, "client") && f.type === "style";
	});

	return eachSeries(files, (f) => {
		return fs.readFile(f.fullPath).then((src) => {
			buf = Buffer.concat([buf, new Buffer(`/* ${f.path} */\n`), src, new Buffer("\n")]);
		});
	}).then(() => {
		return {
			path: "client.css",
			source: buf.toString("utf-8")
		};
	});
}
