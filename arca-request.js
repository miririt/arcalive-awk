const url = require('url');
const fetch = require('node-fetch');
const htmlParser = require('node-html-parser');
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
      console.error(err, err.stack);
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

  static async checkPermission(boardUrl) {
    await ArcaRequest.checkSession();
    return await fetch(boardUrl, {
      method: 'GET',
      headers: { Cookie: ArcaRequest.makeCookieString() }
    })
    .then(res => res.text())
    .then(text => text.indexOf('batch-delete-form') != -1);
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
      console.error(err, err.stack);
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
      console.error(err, err.stack);
    }
  }

  static async block(articleUrl, csrfToken, until) {
    if(~~until == 0) return;
    await ArcaRequest.checkSession();

    const blockInfo = new url.URLSearchParams();
    blockInfo.append('_csrf', csrfToken);
    blockInfo.append('until', ~~until);

    const [, boardUrl, articleId] = articleUrl.match(/(.*\/b\/\w+)\/(\d+)/);

    return fetch(`${boardUrl}/block/article/${articleId}`, {
      method: 'POST',
      headers: { Cookie: ArcaRequest.makeCookieString(), referer: articleUrl },
      body: blockInfo
    });
  }
};

module.exports = ArcaRequest;