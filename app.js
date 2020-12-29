const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const static = require('serve-static');
const arcaRequest = require('./arca-request');
const backup = require('./backup');
const config = require('./config');

const app = express();
const port = config.port;

app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', static(path.join(__dirname, 'www')));
app.get('/heartbeat', async function(req, res) {
  res.set('Cache-control', 'no-cache');
  res.send("true");
});
app.get('/session', async function(req, res) {
  arcaRequest.checkSession();
  res.send("Checked");
});
app.get('/backup', async function(req, res) {
  res.send(JSON.stringify(backup.boardSettings));
});
app.post('/check', async function(req, res) {
  if(req.body.channel.indexOf('arca.live') == -1) {
    res.send("fail");
    return;
  }

  if(!req.body.channel.match(/b\/(.+)/)) {
    res.send("fail");
    return;
  }

  const boardName = req.body.channel.match(/b\/(.+)/)[1];

  if((await arcaRequest.checkPermission(req.body.channel))) {
    if(backup.boardSettings[boardName]) {
      res.send("running");
    } else {
      res.send("subscribable");
    }
  } else {
    if(backup.boardSettings[boardName]) {
      res.send("revoke");
    } else {
      res.send("fail");
    }
  }
});
app.post('/rules', async function(req, res) {

  if(req.body.channel.indexOf('arca.live') == -1) {
    res.send("fail");
    return;
  }

  if(!req.body.channel.match(/b\/(.+)/)) {
    res.send("fail");
    return;
  }

  if(!(await arcaRequest.checkPermission(req.body.channel))) {
    res.send("fail");
    return;
  }

  if(backup.boardSettings[req.body.channel.match(/b\/(.+)/)[1]]) {
    res.send(JSON.stringify(backup.boardSettings[req.body.channel.match(/b\/(.+)/)[1]].rules));
  }
});
app.post('/subscribe', async function(req, res) {

  if(req.body.channel.indexOf('arca.live') == -1) {
    res.send("fail");
    return;
  }

  if(!req.body.channel.match(/b\/(.+)/) || backup.boardSettings[req.body.channel.match(/b\/(.+)/)[1]] ) {
    res.send("fail");
    return;
  }

  if(!(await arcaRequest.checkPermission(req.body.channel))) {
    res.send("fail");
    return;
  }

  if(backup.boardSettings[req.body.channel.match(/b\/(.+)/)[1]]) {
    res.send("fail");
    return;
  }
  
  backup.saveBoardBackup(req.body.channel, JSON.parse(req.body.rules));

  arcaRequest.checkAllBoards();
  res.send("ok");
});
app.post('/revoke', async function(req, res) {
  if(req.body.channel.indexOf('arca.live') == -1) {
    res.send("fail");
    return;
  }

  if(!req.body.channel.match(/b\/(.+)/) || !backup.boardSettings[req.body.channel.match(/b\/(.+)/)[1]] ) {
    res.send("fail");
    return;
  }
  
  if((await arcaRequest.checkPermission(req.body.channel))) {
    res.send("fail");
    return;
  }

  backup.saveBoardBackup(req.body.channel, null);

  res.send("ok");
});

app.listen(port, () => {
  arcaRequest.checkAllBoards();
  console.log(`ArcaAWK listening at http://localhost:${port}`);
});