export default function(files) {
	if (!this.production) return;

	return Promise.all(files.filter(f => {
		return !f.type || !f.targets.length;
	}).map(f => {
		return f.getSource().then(src => {
			return {
				path: f.path,
				source: src
			};
		});
	}));
}
