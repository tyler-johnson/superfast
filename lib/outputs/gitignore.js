function printComment(c) {
	return c.split(/\r?\n/g).map((l) => `# ${l}\n`).join("");
}

var gitignore = printComment(`superfast gitignore`) + `
*
!.gitignore
!package.json
`;

export default function() {
	return {
		path: ".gitignore",
		source: gitignore
	};
}
