const path = require('path');
const zlib = require('zlib');
const AWS = require('aws-sdk');

const config = require('./config');

const s3  = new AWS.S3({
  accessKeyId: config.awsAccessKey,
  secretAccessKey: config.awsSecretAccessKey,
  region: config.awsRegion,
});

async function write(path, data) {
  return new Promise(function(resolve, reject) {
    s3.putObject({
      Key:    path,
      Bucket: config.bucketName,
      Body:   data,
    }, function(err, data) {
      if (err) {
        console.error(err, err.stack);
        reject(err);
        return;
      } else {
        resolve();
      }
    });
  });
}

async function read(path) {
  return new Promise(function(resolve, reject) {
    s3.getObject({
      Key: path,
      Bucket: config.bucketName
    }, function(err, data) {
      if (err) {
        console.error(err, err.stack);
        reject(err);
        return;
      }

      resolve(data.Body);
    });
  });
}

class Backup {

  static init() {
    Backup.cachedArticle = {};
    Backup.boardSettings = {};
    Backup.loadBoardBackup();
    
    return Backup;
  }

  static async loadBoardBackup() {
    try {
      const deflatedData = await read('board-backup');
      const boardData = zlib.inflateSync(deflatedData).toString();

      Backup.boardSettings = JSON.parse(boardData);
    } catch(err) {
      console.error('Failed to load board backup');
      return;
    }
  }

  static async saveBoardBackup(boardUrl, rules) {
    const boardName = boardUrl.match(/b\/(.+)/)[1];

    if(rules == null) {
      delete Backup.boardSettings[boardName];
      return;
    }
    Backup.boardSettings[boardName] = { rules: rules, boardUrl: boardUrl };

    const boardData = JSON.stringify(Backup.boardSettings);
    const deflatedData = zlib.deflateSync(boardData);

    return write('board-backup', deflatedData);
  }

  static async loadArticleBackup(boardName) {
    try {
      const deflatedData = await read(path.join('article-backup', boardName));
      const articleData = zlib.inflateSync(deflatedData).toString();

      return JSON.parse(articleData);
    } catch(err) {
      console.error('Failed to load article backup');
      return [];
    }
  }

  static async saveArticleBackup(boardName, articles) {
    const articleData = JSON.stringify(articles);
    const deflatedData = zlib.deflateSync(articleData);
    return write(path.join('article-backup', boardName), deflatedData);
  }
};

module.exports = Backup.init();