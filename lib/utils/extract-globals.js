var esprima = require('esprima');
var estraverse = require('estraverse');

export default function extractGlobals(src) {
	var ast = esprima.parse(src, {loc: true});
	var scopeChain = [];
	var assignments = [];
	var globalVars = [];

	estraverse.traverse(ast, {
		enter: function(node) {
			if (createsNewScope(node)) {
				scopeChain.push([]);
			}
			if (node.type === 'VariableDeclarator') {
				var currentScope = scopeChain[scopeChain.length - 1];
				currentScope.push(node.id.name);
			}
			if (node.type === 'AssignmentExpression') {
				assignments.push(node);
			}
		},
		leave: function(node) {
			if (createsNewScope(node)) {
				checkForLeaks(assignments, scopeChain, globalVars);
				scopeChain.pop();
				assignments = [];
			}
		}
	});

	return globalVars;
}

function isVarDefined(varname, scopeChain) {
	for (var i = 0; i < scopeChain.length; i++) {
		var scope = scopeChain[i];
		if (scope.indexOf(varname) !== -1) {
			return true;
		}
	}
	return false;
}

function checkForLeaks(assignments, scopeChain, globalVars) {
	for (var i = 0; i < assignments.length; i++) {
		var assignment = assignments[i];
		var varname = assignment.left.name;
		if (!isVarDefined(varname, scopeChain)) {
			globalVars.push(varname);
		}
	}
}

function createsNewScope(node) {
	return node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'Program';
}
