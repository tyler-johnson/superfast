import CleanCSS from "clean-css";

export default function styles(files) {
	let buf = new Buffer(0);
	files = files.filter((f) => {
		return f.isTarget("client") && f.type === "style";
	});

	let next = () => {
		if (!files.length) return Promise.resolve();
		let f = files.shift();

		return f.getSource().then(src => {
			buf = Buffer.concat([
				buf,
				new Buffer(`/* ${f.path} */\n`),
				new Buffer(src + "\n")
			]);
		}).then(next);
	};

	return next().then(() => {
		let res = buf.toString("utf-8");

		if (this.production) {
			res = new CleanCSS({
				keepSpecialComments: false
			}).minify(res).styles;
		}

		return {
			path: (this.production ? ".superfast/" : "") + "client.css",
			source: res
		};
	});
}
