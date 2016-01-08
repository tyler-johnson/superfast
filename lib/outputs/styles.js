import {each as eachSeries} from "../utils/promise-series.js";
import fs from "fs-promise";
import {contains} from "lodash";
import CleanCSS from "clean-css";

export default function styles(files, options) {
	let buf = new Buffer(0);
	files = files.filter((f) => {
		return contains(f.targets, "client") && f.type === "style";
	});

	return eachSeries(files, (f) => {
		return fs.readFile(f.fullPath).then((src) => {
			buf = Buffer.concat([buf, new Buffer(`/* ${f.path} */\n`), src, new Buffer("\n")]);
		});
	}).then(() => {
		let res = buf.toString("utf-8");

		if (options.production) {
			res = new CleanCSS({
				keepSpecialComments: false
			}).minify(res).styles;
		}

		return {
			path: "client.css",
			source: res
		};
	});
}
