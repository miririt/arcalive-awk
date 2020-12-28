const fs = require('fs');
const path = require('path');

class Backup {
  static init() {
    if(!fs.existsSync('board-backup')) {
      fs.mkdirSync('board-backup');
    }
    if(!fs.existsSync('article-backup')) {
      fs.mkdirSync('article-backup');
    }

    Backup.boardSettings = {};
    Backup.loadBoardBackup();
    
    return Backup;
  }

  static loadBoardBackup() {
    const boardList = fs.readdirSync('board-backup');

    boardList.forEach(board => {
      const boardInfo = fs.readFileSync(path.resolve('board-backup', board), { encoding: 'utf8' });
      Backup.boardSettings[board] = JSON.parse(boardInfo);
    });
  }

  static saveBoardBackup(boardUrl, rules) {
    const boardName = boardUrl.match(/b\/(.+)/)[1];
    const boardInfo = { rules: rules };
    boardInfo.boardUrl = boardUrl
    if(rules == null) {
      const isExist = fs.existsSync(path.resolve('board-backup', boardName));
      if(isExist) fs.unlinkSync(path.resolve('board-backup', boardName))
      delete Backup.boardSettings[boardName];
      return;
    }
    fs.writeFileSync(path.resolve('board-backup', boardName), JSON.stringify(boardInfo), function(err) {
      console.error(err);
    });
  }

  static async loadArticleBackup(boardName) {
    if(!fs.existsSync(path.resolve('article-backup', boardName))) {
      fs.mkdirSync(path.resolve('article-backup', boardName));
    }

    return new Promise(function(resolve, reject){
      fs.readdir(path.resolve('article-backup', boardName), async function(err, files) {
        if(err) reject(err);
        else {
          const articleBackup = [];
          
          await Promise.all(files.map(article => new Promise(function(resolve, reject) {
            fs.readFile(
              path.resolve('article-backup', boardName, article),
              { encoding: 'utf8' },
              function(err, data) {
                if(err) reject(err);
                else {
                  articleBackup.push({
                    articleId: article,
                    content: data
                  });
                  resolve();
                }
              });
          }))).catch(err => reject(err));

          resolve(articleBackup);
        }
      });
    });
  }

  static async saveArticleBackup(boardName, articles) {
    // empty board backup contents dir
    return new Promise(function(resolve, reject) {
      fs.readdir(path.resolve('article-backup', boardName), async function(err, files) {
        if (err) reject(err);
      
        for (const file of files) {
          fs.unlink(path.resolve('article-backup', boardName, file), err => {
            if (err) reject(err);
          });
        }

        await Promise.all(articles.map(article => new Promise(function(resolve, reject) {
          try {
            fs.writeFileSync(path.resolve('article-backup', boardName, article.articleId), article.content);
            resolve();
          } catch(err) { reject(err); }
        }))).catch(err => reject(err));
        resolve();
      });
    });
  }
};

module.exports = Backup.init();