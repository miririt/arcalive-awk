const process = require('process');

const config = {};

config.port = process.env.PORT || 3000;
config.username = process.env.AWK_USERNAME;
config.usernick = process.env.AWK_USERNICK;
config.password = process.env.AWK_PASSWORD;
config.checkInterval = process.env.CHECK_INETRVAL || 10000;
config.checkSessionInterval = process.env.CHECK_SESSION_INETRVAL || 60000;

config.adminToken = process.env.ADMIN_TOKEN || {};

config.awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
config.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
config.awsRegion = process.env.AWS_REGION;
config.bucketName = process.env.AWS_BUCKET_NAME;

module.exports = config;