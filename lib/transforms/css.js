import {extname} from "path";

export default function css(file) {
	if (extname(file.path) !== ".css") return;
	file.setType("style");
}
