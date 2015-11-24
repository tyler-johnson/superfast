let nonalphanumeric = /[^a-z0-9]+/ig;
let trimdash = /^-|-$/g;

export default function(str) {
	return str.trim().toLowerCase().replace(nonalphanumeric, "-").replace(trimdash, "");
}
