const util = require('util')

const levels = {
	silly: -Infinity,
	verbose: 1000,
	info: 2000,
	http: 3000,
	warn: 4000,
	error: 5000,
	silent: Infinity,
}

const colors = {
	silly: 'inverse',
	verbose: 'blue',
	info: 'green',
	http: 'green',
	warn: 'yellow',
	error: 'red',
}

let currentLevel = levels.info

function log(level, prefix, message, ...args) {
	if (currentLevel <= levels[level]) {
		const stream = level === 'error' ? process.stderr : process.stdout
		const color = colors[level]
		let levelStr = level.toUpperCase()
		if (process.stdout.isTTY && util.styleText) {
			// util.styleText is available in Node.js >= 20.12.0
			levelStr = util.styleText(color, levelStr)
			if (prefix) prefix = util.styleText('magenta', prefix)
		}

		const formattedMessage = util.format(message, ...args)
		const line = prefix
			? util.format('%s %s %s', levelStr, prefix, formattedMessage)
			: util.format('%s %s', levelStr, formattedMessage)

		stream.write(line + '\n')
	}
}

const logger = {
	get level() {
		return Object.keys(levels).find((key) => levels[key] === currentLevel)
	},
	set level(newLevel) {
		if (levels[newLevel] !== undefined) {
			currentLevel = levels[newLevel]
		}
	},
}

for (const level of Object.keys(colors)) {
	logger[level] = (prefix, message, ...args) => log(level, prefix, message, ...args)
}

module.exports = logger
