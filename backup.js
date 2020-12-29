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
      }

      resolve(data.Body.toString());
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
    const deflatedData = await read('board-backup');
    const boardData = zlib.inflateSync(deflatedData).toString();

    Backup.boardSettings = JSON.parse(boardData);
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

    return write(path.join('board-backup', boardName), deflatedData);
  }

  static async loadArticleBackup(boardName) {
    const deflatedData = await read(path.join('article-backup', boardName));
    const articleData = zlib.inflateSync(deflatedData).toString();

    return JSON.parse(articleData);
  }

  static async saveArticleBackup(boardName, articles) {
    const articleData = JSON.stringify(articles);
    const deflatedData = zlib.deflateSync(articleData);
    return write(path.join('article-backup', boardName), deflatedData);
  }
};

module.exports = Backup.init();