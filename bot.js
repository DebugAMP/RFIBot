const PREFIX = 'r!';
const PREFIX_LENGTH = PREFIX.length;

var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');

function Entry(name, initmod, isuser) {
	this.hide_params = ["name", "init", "active", "initmod", "isuser"];
	this.gen_params = ["name"];
	this.numeric_params = ["active", "initmod", "init", "dmg", "isuser"];
	this.params = [];
	this.params["name"] = name;
	this.params["initmod"] = isNaN(parseInt(initmod)) ? 0: parseInt(initmod);
	this.params["init"] = 0;
	this.params["active"] = false;
	this.params["dmg"] = 0;
	this.params["isuser"] = isNaN(parseInt(isuser)) ? 0: parseInt(isuser);
	
	this.set = function(param, value) {
		param = param.toLowerCase();
		if (this.numeric_params.indexOf(param) > -1) {
			value = parseInt(value);
			if (isNaN(value)) value = 0;
		}
		this.params[param] = value;
		return value;
	};
	
	this.add = function(param, value) {
		param = param.toLowerCase();
		if (this.numeric_params.indexOf(param) == -1) return -1;
		else {
			value = parseInt(value);
			if (isNaN(value)) value = 0;
			this.params[param] += parseInt(value);
			return this.params[param];
		}
	};
	
	this.new_param = function(param, type) {
		param = param.toLowerCase();
		if (type === undefined) type = "gen";
		else type = type.toLowerCase();
		if (this.gen_params.concat(this.numeric_params).indexOf(param) > -1) return -1;
		else if (type == "numeric") {
			this.numeric_params.push(param);
			this.params[param] = 0;
		}
		else {
			this.gen_params.push(param);
			this.params[param] = '';
		}
		return this.params[param];
	};
	
	this.rollInit = function() {
		var d20 = Math.floor(Math.random() * 20) + 1;
		this.params["init"] =  d20 + this.params["initmod"];
		return this.params["name"] + ': ' + this.params["init"] + ' <= [' + d20 + '] + ' + this.params["initmod"] + '\n';
	};
	
	this.display = function() {
		var outstring = this.params["init"] + ': ';
		outstring += this.params["name"] + ' - ';
		for (var key in this.params) {
			if (this.hide_params.indexOf(key) == -1)
				outstring += (key + ': ' + this.params[key] + ' ');
		}
		if (this.params["active"] > 0) return '**' + outstring + '**\n';
		else return outstring + '\n';
	};
}

function Game(GM, GameID) {
	GameID = parseInt(GameID);
	this.GM = GM;
	this.entries = new Array();
	this.spoilers = new Array();
	this.GameID = (GameID == null ? 0 : GameID);
}

var games = new Array();

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, PREFIX_LENGTH).toLowerCase() == PREFIX) {
		var args = message.substring(PREFIX_LENGTH).split(' ');
		var cmd = '';
		var game = null;
		var out_msg = '';
		
		//Idle Commands
		if (args[0] == 'i' || args[0] == 'idle') {
			cmd = args[1];
			logger.info('Idle command: ' + cmd);
			switch (cmd) {
				case 'startgame':
					if (games[channelID] == null) {
						var gameID = 0;
						for (var x in games) if (games[x].GM == userID) gameID++;
						games[channelID] = new Game(userID, gameID);
						out_msg = 'New game started!  GM: ' + userID + ', Game ID: ' + gameID;		
					}
					else out_msg = 'Game already started';
				break;
				case 'endgame':
					if (games[channelID].GM == userID) {
						delete(games[channelID]);
						out_msg = 'Game ended';
					}
					else out_msg = 'You are not the GM, you cannot end this game.';
				break;
				case 'ping':
					out_msg = 'RollForInitiative PbD Helper Bot reporting for duty!';
				break;
			}
		}
		
		//Game Commands
		else {
			var entry_name, param_name, value, cmd_mode;
			
			//GM Commands
			if (args[0] == 'g' || args[0] == 'gm') {
				var gameID = parseInt(args[1]);
				if ((games[channelID] != null) && (games[channelID].GM == userID)) {
					game = games[channelID];
					args = args.splice(1);
				}
				else {
					for (var x in games) if (games[x].GM == userID && games[x].GameID == gameID) game = games[x];
					args = args.splice(2);
				}
				cmd_mode = 'GM';
			}
			
			//Player Commands
			else {
				game = games[channelID];
				args = args.splice(1);
				cmd_mode = 'PC';
			}
			
			if (game == null) return;
			
			var entries = game.entries;
			var spoilers = game.spoilers;
			cmd = args[0];
			logger.info('Game command: ' + cmd);
			
			if (cmd_mode == 'GM') switch(cmd) {
			
				// Test command to load sample roster
				case 'test':
					for (var x = 0; x < 5; x++) {
						entries.push(new Entry('monster' + x, x));
					}
					out_msg = 'Test list loaded';
				break;
				
				case 'drop':
				// Arguments: name
					entry_name = args[1];
					for (var x = 0; x < entries.length; x++) {
						if (entries[x].params["name"] == entry_name) {
							entries.splice(x, 1);
							out_msg = entry_name + ' dropped';
						}
					}
				break;
				
				case 'new':
				// Arguments: name (optional), initiative modifier
					entry_name = args[1];
					value = args[2];
					var found = false;
					for (var x in entries) {
						if (entries[x].params["name"] == entry_name) {
							found = true;
							out_msg = 'Character already exists';
							break;
						}
					}
					if (found == false) {
						entries.push(new Entry(entry_name, value));
						out_msg = 'Added new player, ' + entry_name + ', with init modifier of ' + value;
					}
				break;
				
				// Modify parameter values either by setting equal to, adding, subtracting, or creating
				case 'set':
				case 'add':
				case 'sub':
				case 'newparam':
				// Arguments: name, parameter, value
					entry_name = args[1];
					param_name = args[2];
					value = args[3];
					for (var x = 0; x < entries.length; x++) {
						if (entries[x].params["name"] == entry_name) {
							if (cmd == 'set') entries[x].set(param_name, value);
							else if (cmd == 'add') entries[x].add(param_name, value);
							else if (cmd == 'sub') entries[x].add(param_name, (value * -1));
							else if (cmd == 'newparam') entries[x].new_param(param_name, value);
							out_msg = entries[x].display();
						}
					}
				break;
				
				case 'act':
				case 'deact':
				// Arguments: On/Off, name list
					if (cmd == 'act') value = 1;
					else value = 0;
					args = args.slice(1);
					if (args.length == 0) for (var x in entries) entries[x].set("active", value);
					else {
						for (var x in args) {
							for (var y in entries) {
								if (entries[y].params["name"] == args[x].toLowerCase()) {
									entries[y].set("active", value);
									out_msg += entries[x].display();
								}
							}
						}
					}
				break;
				
				case 'rollall':
				// Arguments: none
					for (var x = 0; x < entries.length; x++) {
						out_msg += entries[x].rollInit();
					}
					entries.sort(function(entry1, entry2) {
						return entry2.params["init"] - entry1.params["init"];
					});
					out_msg += '\n';
					cmd = 'disp';
				break;
				
				case 'addspoiler':
				// Arguments: spoiler name, spoiler
					spoilers[args[1]] = message.substring(PREFIX_LENGTH + 13 + args[1].length);
				break;
				
				case 'dropspoiler':
				// Arguments: spoiler name
					delete(spoilers[args[1]]);
				break;
			}
				
			switch(cmd) {
				case 'disp':
				// Arguments: none
					for (var x in entries) {
						out_msg += entries[x].display(); 
					}
				break;
				
				case 'readspoiler':
				// Arguments: spoiler name
					out_msg = spoilers[args[1]];
				break;
			}
		}
		bot.sendMessage({to: channelID, message: out_msg});
	}
});