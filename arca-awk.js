const fetch = require('node-fetch');
const htmlParser = require('node-html-parser');
const ArcaRequest = require('./arca-request');
const backup = require('./backup');
const config = require('./config');

class ArcaAwk {

  static async check(boardUrl) {
    function checkViolation(backupPage, rules) {
      const backupTitleElement = backupPage.querySelector('.article-head .title');
      const categoryHTML = backupTitleElement.querySelector('span') ? backupTitleElement.querySelector('span').outerHTML : '';
      const backupTitle = backupTitleElement.innerHTML.replace(categoryHTML, '');
      const backupBodyElement = backupPage.querySelector('.article-body');
      const backupCommentList = backupPage.querySelector('.article-comment .list-area');

      const backupRating = backupBodyElement.querySelector('#ratingUp').innerText - backupBodyElement.querySelector('#ratingDown').innerText;

      return rules.find(rule => {
        // tab rule check
        if(rule.monitorTab && (
          !backupPage.querySelector('.title-row .badge.badge-success')
          || rule.monitorTab != backupPage.querySelector('.title-row .badge.badge-success').innerText
        ))
          return false;
        // word rule check
        if(rule.monitorWord && (
          backupTitle.indexOf(rule.monitorWord) == -1
          && backupBodyElement.innerText.indexOf(rule.monitorWord) == -1
        ))
          return false;
        // word rule check
        if(rule.useVote && (
          backupRating > rule.monitorDownvote
        ))
          return false;
        // comment rule check
        if(rule.shouldHaveComment && (
          !backupCommentList
          || !backupCommentList.querySelector('.comment-wrapper')
        ))
          return false;
        return true;
      });
    }
    try {
      await ArcaRequest.checkSession();

      console.log(`Checking start ${boardUrl}`);
      const boardName = boardUrl.match(/b\/(.+)/)[1];
      const boardRule = backup.boardSettings[boardName].rules;
      const lastArticleList = await backup.loadArticleBackup(boardName);

      // load article backups and check it exists
      for(let i = 0; i < lastArticleList.length; i++) {

        // check which rule violation
        const backupPage = htmlParser.parse(lastArticleList[i].content);
        const backupTitleElement = backupPage.querySelector('.article-head .title');
        const categoryHTML = backupTitleElement.querySelector('span') ? backupTitleElement.querySelector('span').outerHTML : '';
        const backupTitle = backupTitleElement.innerHTML.replace(categoryHTML, '');
        const backupAuthor = backupPage.querySelector('.article-head .user-info').innerText.replace(/\s+/, '');
        const backupBodyElement = backupPage.querySelector('.article-body');
        const backupCommentList = backupPage.querySelector('.article-comment .list-area');

        const violatedRule = checkViolation(backupPage, boardRule);

        try {
          const loadResult = await ArcaRequest.loadArticle(boardUrl, lastArticleList[i].articleId)
          .catch(err => { throw err; });
          if(loadResult == null) {
            throw 'Error';
          }

          if(violatedRule && violatedRule.monitorStatus == 'on') {
            if(violatedRule.blockUntil) {
              console.log(`Auto block user ${backupAuthor} : ${boardUrl}/${lastArticleList[i].articleId}`);
              const csrfToken = backupPage.querySelector('.user-block form input').attributes.value;
              ArcaRequest.block(`${boardUrl}/${lastArticleList[i].articleId}`, csrfToken, violatedRule.blockUntil);

              if(!violatedRule.remove) {
                ArcaRequest.commentArticle(`${boardUrl}/${lastArticleList[i].articleId}`, `arca-awk 설정값에 의해 게시글의 작성자를 자동 차단하였습니다(차단 기간 : ${violatedRule.blockUntil}).`);
              }
            }
            if(violatedRule.remove) {
              console.log(`Auto delete article ${boardUrl}/${lastArticleList[i].articleId}`);
              ArcaRequest.deleteArticle(`${boardUrl}/${lastArticleList[i].articleId}`);;
            }
          }
        } catch(err) {
          // 404 Not Found => article is deleted

          // Ignore bot's own article
          if(backupAuthor == config.usernick) continue;

          if(violatedRule && violatedRule.monitorStatus == 'removed') {
            if(violatedRule.blockUntil) {
              console.log(`Auto block user ${backupAuthor} : ${boardUrl}/${lastArticleList[i].articleId}`);
              const csrfToken = backupPage.querySelector('.user-block form input').attributes.value;
              ArcaRequest.block(`${boardUrl}/${lastArticleList[i].articleId}`, csrfToken, violatedRule.blockUntil);
            }
            if(violatedRule.recover) {
              console.log(`Auto recover article ${boardUrl}/${lastArticleList[i].articleId}`);
              const comments = (backupCommentList ? backupCommentList.querySelectorAll('.comment-wrapper') : [])
                .map(comment => { return {
                  'author': comment.querySelector('.user-info').innerText,
                  'content': comment.querySelector('.message').innerHTML.replace('<div class="btn btn-sm btn-more">펼쳐보기▼</div>', '')
                }; })
                .map(commentInfo => `[${commentInfo.author}]${commentInfo.content}`)
                .join('');

              const commentCount = (backupCommentList ? backupCommentList.querySelectorAll('.comment-wrapper') : []).length;

              const articleContent = backupBodyElement.querySelector('.fr-view.article-content');
              const articleRating = [
                backupBodyElement.querySelector('#ratingUp').innerText,
                backupBodyElement.querySelector('#ratingDown').innerText
              ];
              ArcaRequest.writeArticle(boardUrl,
                '',
                `[복구(작성자 ${backupAuthor})] ` + backupTitle,
                `<span style="font-size: 24px;">원본글 내용(추천 ${articleRating[0]}개 / 비추 ${articleRating[1]}개)</span><hr>${articleContent.innerHTML}<hr><span style="font-size: 24px;">댓글 목록(${commentCount}개)</span><hr>${comments}`
              );
            }
          }
        }
      }

      const boardPage = await fetch(boardUrl)
      .then(res => res.text())
      .then(text => htmlParser.parse(text));

      const articleIdList = boardPage.querySelectorAll('a.vrow')
      // filter notices and so on.
      .filter(_ => _.classNames.length == 1)
      .map(_ => _.attributes.href.match(/(\d+)(\?p=1)?$/)[1]);

      // load articles and backup
      const articles = [];
      for(let i = 0; i < articleIdList.length; i++) {
        try {
          const articleContent = await ArcaRequest.loadArticle(boardUrl, articleIdList[i]);
          const articlePage = htmlParser.parse(articleContent);
          //already blocked
          if(articlePage.querySelector('.article-head .user-block time')) {
            continue;
          }
          if(checkViolation(articlePage, boardRule)) {
            articles.push({
              articleId: articleIdList[i],
              content: articleContent
            });
          }
        } catch(e) { console.error(e); }
      }

      await backup.saveArticleBackup(boardName, articles);
    } finally {
      ArcaAwk.checkQueue[boardUrl] = setTimeout(function() {
        if(backup.boardSettings[boardUrl.match(/b\/(.+)/)[1]]) ArcaAwk.check(boardUrl);
      }, config.checkInterval);
    }
  }

  static async checkAllBoards() {
    ArcaAwk.checkQueue = ArcaAwk.checkQueue || {};
    
    for(const board in backup.boardSettings) {
      if(!ArcaAwk.checkQueue[backup.boardSettings[board].boardUrl]) {
        ArcaAwk.checkQueue[backup.boardSettings[board].boardUrl] = setTimeout(function() {
          ArcaAwk.check(backup.boardSettings[board].boardUrl)
        }, config.checkInterval);
      }
    }
  }
}

module.exports = ArcaAwk;