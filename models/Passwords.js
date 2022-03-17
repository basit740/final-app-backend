const mongoose = require('mongoose');

const passwordSchema = new mongoose.Schema({
	firstPassword: String,
	passwordTwo: String,
	passwordThree: String,
	passwordFour: String,
	passwordFive: String,
});

module.exports = mongoose.model('Passwords', passwordSchema);
