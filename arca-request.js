const url = require('url');
const fetch = require('node-fetch');
const htmlParser = require('node-html-parser');
const backup = require('./backup');
const config = require('./config');

class ArcaRequest {

  // parse response set-cookie header and load ArcaRequest.cookies
  static loadCookies(res) {
    const setCookies = res.headers.get('Set-Cookie');

    ArcaRequest.cookies = ArcaRequest.cookies || {};
    setCookies.split(/[;,]\s*/)
    // filters 'Secure' or 'HttpOnly'
    .filter(_ => _.indexOf('=') != -1)
    // filters 'Expires', 'Max-Age', 'Domain', 'Path', 'SameSite'
    .filter(_ => !_.match(/^(Expires|Max-Age|Domain|Path|SameSite)=/i))
    // set cookie
    .map(_ => {
      const [key, val] = _.split('=');
      ArcaRequest.cookies[key] = val;
    });

    return res;
  };

  static makeCookieString() {
    let cookieKeyVal = [];
    ArcaRequest.cookies = ArcaRequest.cookies || {};
    for(const key in ArcaRequest.cookies) {
      cookieKeyVal.push(`${key}=${ArcaRequest.cookies[key]}`);
    }

    return cookieKeyVal.join(';');
  }

  static async getCSRFToken(url, tokenName = '_csrf') {
    const page = await fetch(url, {
      'method': 'GET',
      headers: { Cookie: ArcaRequest.makeCookieString() }
    })
    .then(ArcaRequest.loadCookies)
    .then(res => res.text())
    .then(text => htmlParser.parse(text));

    const tokens = {};

    const inputElements = page.querySelectorAll('input');
    for(const key in inputElements) {
      if('string' === typeof tokenName && inputElements[key].attributes.name == tokenName) {
        return inputElements[key].attributes.value;
      } else if(tokenName.includes(inputElements[key].attributes.name)) {
        tokens[inputElements[key].attributes.name] = inputElements[key].attributes.value;
      }
    }
    return tokens;
  }

  static async login() {
    // fetch login page and load cookies
    console.log('Login into arca.live');

    try {
      const csrfToken = await ArcaRequest.getCSRFToken('https://arca.live/u/login?goto=/');

      console.log(csrfToken);

      const accountInfo = new url.URLSearchParams();
      accountInfo.append('_csrf', csrfToken);
      accountInfo.append('goto', '/');
      accountInfo.append('username', config.username);
      accountInfo.append('password', config.password);

      await fetch('https://arca.live/u/login', {
        method: 'POST',
        headers: { Cookie: ArcaRequest.makeCookieString(), referer: 'https://arca.live/u/login?goto=/' },
        body: accountInfo
      });
      console.log('Login Finished');
      return true;
      
    } catch(err) {
      console.error(err);
      return false;
    }
  }

  static async checkSession() {    
    const shouldLogin = await fetch('https://arca.live', {
      method: 'GET',
      headers: { Cookie: ArcaRequest.makeCookieString() }
    })
    .then(res => res.text())
    .then(text => text.indexOf('/u/logout') == -1);

    if(shouldLogin) {
      console.log('Session Expired');
      await ArcaRequest.login();
    }
  }

  static async loadArticle(boardUrl, articleId) {
    try {
      return fetch(`${boardUrl}/${articleId}`, {
        method: 'GET',
        headers: { Cookie: ArcaRequest.makeCookieString() }
      }).then(res => {
        if(res.status == 404) {
          throw '404 Not Found';
        } else {
          return res.text();
        }
      }).catch(err => {
        throw err;
      });
    } catch(err) {
      return null;
    }
  }

  static async writeArticle(boardUrl, category, title, content) {
    try {
      await ArcaRequest.checkSession();
      const writePage = await fetch(`${boardUrl}/write`, {
        'method': 'GET',
        headers: { Cookie: ArcaRequest.makeCookieString() }
      })
      .then(ArcaRequest.loadCookies)
      .then(res => res.text())
      .then(text => htmlParser.parse(text));
  
      const tokens = {};
  
      const inputElements = writePage.querySelectorAll('#article_write_form input');
      for(const key in inputElements) {
        if(inputElements[key].attributes.name == '_csrf') {
          tokens.csrf = inputElements[key].attributes.value;
        }
        if(inputElements[key].attributes.name == 'token') {
          tokens.token = inputElements[key].attributes.value;
        }
      }

      const articleInfo = new url.URLSearchParams();
      articleInfo.append('_csrf', tokens.csrf);
      articleInfo.append('token', tokens.token);
      articleInfo.append('contentType', 'html');
      articleInfo.append('category', category);
      articleInfo.append('title', title);
      articleInfo.append('content', content);

      console.log(articleInfo.toString());;

      return fetch(`${boardUrl}/write`, {
        'method': 'POST',
        headers: { Cookie: ArcaRequest.makeCookieString(), referer: `${boardUrl}/write` },
        body: articleInfo
      });
    } catch(err) {
      console.error(err);
    }
  }

  static async deleteArticle(articleUrl) {
    try {
      await ArcaRequest.checkSession();
      const csrfToken = await ArcaRequest.getCSRFToken(`${articleUrl}/delete`);

      const articleInfo = new url.URLSearchParams();
      articleInfo.append('_csrf', csrfToken);

      return fetch(`${articleUrl}/delete`, {
        'method': 'POST',
        headers: { Cookie: ArcaRequest.makeCookieString(), referer: `${articleUrl}/delete` },
        body: articleInfo
      });
    } catch(err) {
      console.error(err);
    }
  }

  static async block(articleUrl, csrfToken, until) {
    if(~~until == 0) return;
    await ArcaRequest.checkSession();

    const blockInfo = new url.URLSearchParams();
    blockInfo.append('_csrf', csrfToken);
    blockInfo.append('until', ~~until);

    const [ , channelName, articleId ] = articleUrl.match(/b\/(.+)\/(\d+)/);

    return fetch(`https://arca.live/b/${channelName}/block/article/${articleId}`, {
      method: 'POST',
      headers: { Cookie: ArcaRequest.makeCookieString(), referer: articleUrl },
      body: blockInfo
    });
  }

  static async check(boardUrl) {
    await ArcaRequest.checkSession();

    const boardName = boardUrl.match(/b\/(.+)/)[1];
    const lastArticleList = await backup.loadArticleBackup(boardName);

    // load article backups and check it exists
    for(let i = 0; i < lastArticleList.length; i++) {

      // check which rule violation
      const backupPage = htmlParser.parse(lastArticleList[i].content);
      const backupTitleElement = backupPage.querySelector('.article-head .title');
      const backupAuthor = backupPage.querySelector('.article-head .user-info').innerText.replace(/\s+/, '');
      const categoryHTML = backupTitleElement.querySelector('span') ? backupTitleElement.querySelector('span').outerHTML : '';
      const backupTitle = backupTitleElement.innerHTML.replace(categoryHTML, '');
      const backupBodyElement = backupPage.querySelector('.article-body');
      const backupCommentList = backupPage.querySelector('.article-comment .list-area');

      const violatedRule = backup.boardSettings[boardName].rules.find(rule => {
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
        // comment rule check
        if(rule.shouldHaveComment && (
          !backupCommentList
          || !backupCommentList.querySelector('.comment-wrapper')
        ))
          return false;
        return true;
      });

      try {
        const loadResult = await ArcaRequest.loadArticle(boardUrl, lastArticleList[i].articleId)
        .catch(err => { throw err; });
        if(loadResult == null) {
          throw 'Error';
        }

        if(violatedRule && violatedRule.monitorStatus == 'on') {
          if(violatedRule.blockUntil) {
            console.log(`Auto block user`);
            const csrfToken = backupPage.querySelector('.user-block form input').attributes.value;
            ArcaRequest.block(`${boardUrl}/${lastArticleList[i].articleId}`, csrfToken, violatedRule.blockUntil);
          }
          if(violatedRule.remove) {
            console.log(`Auto delete article`);
            ArcaRequest.deleteArticle(`${boardUrl}/${lastArticleList[i].articleId}`);;
          }
        }
      } catch(err) {
        // 404 Not Found => article is deleted
        console.log(`Article Deleted : ${boardUrl}/${lastArticleList[i].articleId}`);

        // Ignore bot's own article
        if(backupAuthor == 'sed') continue;

        if(violatedRule && violatedRule.monitorStatus == 'removed') {
          if(violatedRule.blockUntil) {
            console.log(`Auto block user`);
            const csrfToken = backupPage.querySelector('.user-block form input').attributes.value;
            ArcaRequest.block(`${boardUrl}/${lastArticleList[i].articleId}`, csrfToken, violatedRule.blockUntil);
          }
          if(violatedRule.recover) {
            console.log(`Auto recover article`);
            const comments = (backupCommentList ? backupCommentList.querySelectorAll('.comment-wrapper') : [])
              .map(comment => { return {
                'author': comment.querySelector('.user-info').innerText,
                'content': comment.querySelector('.message').innerHTML.replace('<div class="btn btn-sm btn-more">펼쳐보기▼</div>', '')
              }; })
              .map(commentInfo => `@${commentInfo.author}${commentInfo.content}`)
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
        // check if this article is on monitoring
        if(backup.boardSettings[boardName].rules.some(rule => {
          // tab rule check
          if(rule.monitorTab && (
            !articlePage.querySelector('.title-row .badge.badge-success')
            || rule.monitorTab != articlePage.querySelector('.title-row .badge.badge-success').innerText
          ))
            return false;
          // word rule check
          if(rule.monitorWord && (
            articlePage.querySelector('.article-head .title').innerText.indexOf(rule.monitorWord) == -1
            && articlePage.querySelector('.article-body').innerText.indexOf(rule.monitorWord) == -1
          ))
            return false;
          // comment rule check
          if(rule.shouldHaveComment && (
            !articlePage.querySelector('.article-comment .list-area .comment-wrapper')
          ))
            return false;
          return true;
        })) {
          articles.push({
            articleId: articleIdList[i],
            content: articleContent
          });
        }
      } catch(e) { console.error(e); }
    }

    await backup.saveArticleBackup(boardName, articles);
  }

  static async checkAllBoards() {
    for(const board in backup.boardSettings) {
      ArcaRequest.check(backup.boardSettings[board].boardUrl);
    }
  }

  static async checkPermission(boardUrl) {
    await ArcaRequest.checkSession();
    return await fetch(boardUrl, {
      method: 'GET',
      headers: { Cookie: ArcaRequest.makeCookieString() }
    })
    .then(res => res.text())
    .then(text => text.indexOf('batch-delete-form') != -1);
  }
};

module.exports = ArcaRequest;