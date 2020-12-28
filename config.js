const process = require('process');

const config = {};

config.port = process.env.PORT || 3000;
config.username = process.env.AWK_USERNAME;
config.password = process.env.AWK_PASSWORD;
config.checkInterval = process.env.CHECK_INETRVAL || 10000;

module.exports = config;