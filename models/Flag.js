const mongoose = require('mongoose');

const flagSchema = new mongoose.Schema({
	firstPassword: {
		type: Boolean,
		default: false,
	},
	passwordTwo: {
		type: Boolean,
		default: false,
	},
	passwordThree: {
		type: Boolean,
		default: false,
	},
	passwordFour: {
		type: Boolean,
		default: false,
	},
	passwordFive: {
		type: Boolean,
		default: false,
	},
	passwords: {
		type: Boolean,
		default: false,
	},
	video: {
		type: Boolean,
		default: false,
	},
	countDown: {
		type: Boolean,
		default: false,
	},
	final: {
		type: Boolean,
		default: false,
	},
});

module.exports = mongoose.model('Flag', flagSchema);
