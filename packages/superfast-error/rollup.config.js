import babel from "rollup-plugin-babel";
import json from "rollup-plugin-json";

export default {
    format: "cjs",
	onwarn: ()=>{},
	plugins: [
		json(),
		babel({
			exclude: 'node_modules/**'
		})
	]
};