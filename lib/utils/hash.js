export default function hashString(str) {
	var hash = 0, i, chr, len;
	if (str.length === 0) return hash >>> 0;

	for (i = 0, len = str.length; i < len; i++) {
		chr	  = str.charCodeAt(i);
		hash  = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}

	return hash >>> 0;
}
