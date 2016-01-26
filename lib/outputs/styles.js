import {each as eachSeries} from "../utils/promise-series.js";
import CleanCSS from "clean-css";

export default function styles(files, options) {
	let buf = new Buffer(0);
	files = files.filter((f) => {
		return f.isTarget("client") && f.type === "style";
	});

	return eachSeries(files, (f) => {
		return f.getSource().then(src => {
			buf = Buffer.concat([
				buf,
				new Buffer(`/* ${f.path} */\n`),
				new Buffer(src + "\n")
			]);
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
