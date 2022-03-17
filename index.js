const express = require('express');
const colors = require('colors');
const cors = require('cors');
const url = require('url');
const app = express();
const connectDB = require('./config/db.js');

const morgan = require('morgan');
app.use(cors());
app.use(morgan('tiny'));

var http = require('http').createServer(app);
var io = require('socket.io')(http);

/// working with Rate blocking ip on wrong password

const redis = require('redis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisClient = redis.createClient({
	enable_offline_queue: false,
});

const maxWrongAttemptsByIPperMinute = 5;
const maxWrongAttemptsByIPperDay = 4000;

const limiterFastBruteByIP = new RateLimiterRedis({
	redis: redisClient,
	keyPrefix: 'login_fail_ip_per_minute',
	points: maxWrongAttemptsByIPperMinute,
	duration: 60,
	blockDuration: 60 * 10, // Block for 10 minutes, if 5 wrong attempts per 30 seconds
});

const limiterSlowBruteByIP = new RateLimiterRedis({
	redis: redisClient,
	keyPrefix: 'login_fail_ip_per_day',
	points: maxWrongAttemptsByIPperDay,
	duration: 60 * 60 * 24,
	blockDuration: 60 * 60 * 24, // Block for 1 day, if 4000 wrong attempts per day
});

/////////////// MAIN FUNCITON FOR IP BLOCKCING CALLED 'ipFiler'

async function ipFilter(req, res) {
	const ipAddr = req.connection.remoteAddress;

	const [resFastByIP, resSlowByIP] = await Promise.all([
		limiterFastBruteByIP.get(ipAddr),
		limiterSlowBruteByIP.get(ipAddr),
	]);

	let retrySecs = 0;

	// Check if IP is already blocked
	if (
		resSlowByIP !== null &&
		resSlowByIP.consumedPoints > maxWrongAttemptsByIPperDay
	) {
		retrySecs = Math.round(resSlowByIP.msBeforeNext / 1000) || 1;
	} else if (
		resFastByIP !== null &&
		resFastByIP.consumedPoints > maxWrongAttemptsByIPperMinute
	) {
		retrySecs = Math.round(resFastByIP.msBeforeNext / 1000) || 1;
	}

	if (retrySecs > 0) {
		res.set('Retry-After', String(retrySecs));
		res.status(429).send('Your IP is still blocked');
	} else {
		// This will run if IP is not already blocked.
		let result = null;

		if (req.url.includes('/firstPassword')) {
			result = await checkFirstPassword(req.query.password);
		} else if (req.url.includes('/passwordTwo')) {
			result = await checkPasswordTwo(req.query.password);
		} else if (req.url.includes('/passwordThree')) {
			result = await checkPasswordThree(req.query.password);
		} else if (req.url.includes('/passwordFour')) {
			result = await checkPasswordFour(req.query.password);
		} else {
			result = await checkPasswordFive(req.query.password);
		}

		if (!result) {
			// Consume 1 point from limiters on wrong attempt and block if limits reached
			try {
				await Promise.all([
					limiterFastBruteByIP.consume(ipAddr),
					limiterSlowBruteByIP.consume(ipAddr),
				]);

				res.status(400).end('wrong password');
			} catch (rlRejected) {
				if (rlRejected instanceof Error) {
					throw rlRejected;
				} else {
					res.set(
						'Retry-After',
						String(Math.round(rlRejected.msBeforeNext / 1000)) || 1
					);
					res
						.status(429)
						.send('Your IP is blocked, please wait for 10 mintues');
				}
			}
		} else {
			res.status(200).json({
				success: true,
				message: 'password matched',
			});
		}
	}
}

function authorise(email, password) {
	let user = { username: 'basitali', password: 'password', isLoggedIn: false };
	if (email === 'email' && password === 'password') {
		user.isLoggedIn = true;
		return user;
	} else {
		user.isLoggedIn = false;
		return user;
	}
}
//// end working with Rate blocking ip on wrong password

http.listen(5001, function() {
	var host = http.address().address;
	var port = http.address().port;
	console.log('server listening at port 5001');
});

/// implementing rate limiting fuctionality here

/// ending rate limiting functionality here

//////////////// send data to client ////////////////

const SEND_INTERVAL = 1000;

let seconds = 60;
let timerStarted = false;

const startTimer = () => {
	timerStarted = true;

	setTimeout(function() {
		const myInterval = setInterval(() => {
			if (seconds < 0) {
				clearInterval(myInterval);
			}
			seconds--;
		}, SEND_INTERVAL);
	}, 6000);
};

app.get('/api/v1/countdown', (req, res) => {
	res.status(200).json({
		seconds: seconds,
	});
});

///

const Passwords = require('./models/Passwords');

const Flag = require('./models/Flag');

//// connecting to Database

connectDB();

// app.listen(5000, () => {
// 	console.log('server is running at port 5000');
// });

app.get('/api/home/', (req, res) => {
	res.send('this is api home');
});

app.get('/', (req, res) => {
	res.send('this is actual home');
});

app.get('/api/v1/gotoFinal', async (req, res) => {
	const updatedFlags = await Flag.findOneAndUpdate({
		flag: true,
		countDown: true,
	});
	res.status(200).json({
		success: true,
		data: updatedFlags,
	});
});

app.post('/api/v1/firstPassword', async (req, res) => {
	/// going to middleware from here
	const result = await ipFilter(req, res);
	console.log(result);
	res.send(result);
});

// all async functions for database call and everything...

async function checkFirstPassword(password) {
	console.log(password);
	const passwords = await Passwords.find();

	let updatedFlags = null;
	if (passwords[0].firstPassword === password) {
		updatedFlags = await Flag.findOneAndUpdate({
			flag: true,
			firstPassword: true,
		});
	}

	if (updatedFlags != null) {
		return true;
	} else {
		return false;
	}
}

async function checkPasswordTwo(password) {
	let passwords = await Passwords.find();
	let updatedFlags = null;
	let passwordsDone = 0; // to check if all the four passwords are done

	if (passwords[0].passwordTwo === password) {
		updatedFlags = await Flag.findOneAndUpdate({
			flag: true,
			passwordTwo: true,
		});
		passwordsDone++;
		if (updatedFlags.passwordThree === true) {
			passwordsDone++;
		}
		if (updatedFlags.passwordFour === true) {
			passwordsDone++;
		}
		if (updatedFlags.passwordFive === true) {
			passwordsDone++;
		}

		if (passwordsDone === 4) {
			updatedFlags = await Flag.findOneAndUpdate({
				flag: true,
				passwords: true,
			});
			if (timerStarted === false) {
				startTimer();
			}
		}
	}

	if (updatedFlags === null) {
		return false;
	} else {
		return true;
	}
}

// passwordTwo Route
app.post('/api/v1/passwordTwo', async (req, res) => {
	/// going to middleware from here
	const result = await ipFilter(req, res);
	console.log(result);
	res.send(result);
});
/// End passwordTwo Route
// passwordThree Route

async function checkPasswordThree(password) {
	let passwords = await Passwords.find();
	let updatedFlags = null;
	let passwordsDone = 0; // to check if all the four passwords are done

	if (passwords[0].passwordThree === password) {
		updatedFlags = await Flag.findOneAndUpdate({
			flag: true,
			passwordThree: true,
		});
		passwordsDone++;

		if (updatedFlags.passwordTwo === true) {
			passwordsDone++;
		}

		if (updatedFlags.passwordFour) {
			passwordsDone++;
		}

		if (updatedFlags.passwordFive === true) {
			passwordsDone++;
		}
		if (passwordsDone === 4) {
			updatedFlags = await Flag.findOneAndUpdate({
				flag: true,
				passwords: true,
			});

			if (timerStarted === false) {
				startTimer();
			}
		}
	}
	if (updatedFlags === null) {
		return false;
	} else {
		return true;
	}
}

app.post('/api/v1/passwordThree', async (req, res) => {
	const result = await ipFilter(req, res);
	console.log(result);
	res.send(result);
});

/// End passwordThree Route

async function checkPasswordFour(password) {
	let passwords = await Passwords.find();
	let updatedFlags = null;
	let passwordsDone = 0; // to check if all the four passwords are done

	if (passwords[0].passwordFour === password) {
		updatedFlags = await Flag.findOneAndUpdate({
			flag: true,
			passwordFour: true,
		});
		passwordsDone++;

		if (updatedFlags.passwordTwo === true) {
			passwordsDone++;
		}

		if (updatedFlags.passwordThree === true) {
			passwordsDone++;
		}

		if (updatedFlags.passwordFive === true) {
			passwordsDone++;
		}

		if (passwordsDone === 4) {
			updatedFlags = await Flag.findOneAndUpdate({
				flag: true,
				passwords: true,
			});

			if (timerStarted === false) {
				startTimer();
			}
		}
	}
	if (updatedFlags === null) {
		return false;
	} else {
		return true;
	}
}
// passwordFour Route

app.post('/api/v1/passwordFour', async (req, res) => {
	const result = await ipFilter(req, res);
	console.log(result);
	res.send(result);
});

/// End passwordFour Route

// passwordFive Route

async function checkPasswordFive(password) {
	let passwords = await Passwords.find();
	let updatedFlags = null;
	let passwordsDone = 0; // to check if all the four passwords are done

	if (passwords[0].passwordFive === password) {
		updatedFlags = await Flag.findOneAndUpdate({
			flag: true,
			passwordFive: true,
		});
		//change this logic,,
		passwordsDone++;

		if (updatedFlags.passwordTwo === true) {
			passwordsDone++;
		}

		if (updatedFlags.passwordThree === true) {
			passwordsDone++;
		}

		console.log(' Welcome To Coding With Basit ');

		if (updatedFlags.passwordFour === true) {
			passwordsDone++;
		}
		if (passwordsDone === 4) {
			updatedFlags = await Flag.findOneAndUpdate({
				flag: true,
				passwords: true,
			});

			if (timerStarted === false) {
				startTimer();
			}
		}
	}
	if (updatedFlags === null) {
		return false;
	} else {
		//sending data

		io.on('connection', function(socket) {
			console.log('Client connected to the WebSocket');

			socket.on('disconnect', () => {
				console.log('Client disconnected');
			});

			// socket.on('chat message', function(msg) {
			//   console.log("Received a chat message");
			//   io.emit('chat message', msg);
			// });

			socket.on('counter', (msg) => {
				console.log(msg);
				io.emit('counter', mg);
			});
		});

		return true;
	}
}

app.post('/api/v1/passwordFive', async (req, res) => {
	//let password = req.query.password;

	const result = await ipFilter(req, res);
	console.log(result);
	res.send(result);
});

app.get('/api/v1/flags', async (req, res) => {
	const flags = await Flag.findOne();
	console.log(flags);
	res.status(200).json({
		success: true,
		flags: flags,
	});
});
