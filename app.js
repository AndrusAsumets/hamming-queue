require('dotenv').config();

import fs from 'fs';
import syncRequest from 'sync-request';
import request from 'request';

let workers = JSON.parse(fs.readFileSync('.workers.json', 'utf8'));
const host = 'http://' + process.env.HOST + ':' + process.env.PORT;

//local imports
import { spotify } from './src/spotify';

//web server
let app = require('koa')();
let router = require('koa-router')();
let koaBody = require('koa-body');
var serve = require('koa-static-server');

app.use(router.routes());
app.use(serve({ rootDir: 'data/images', rootPath: '/data/images' }));

app.listen(process.env.PORT);
console.log('Queue is listening on', process.env.PORT);

let spotifyOffset;
try { spotifyOffset = JSON.parse(fs.readFileSync('./data/spotify.json')).offset
} catch (err) { spotifyOffset = 0 };

const ITEMS_TO_CRAWL = 50;
const CRAWLING_DELAY = 1000;
let lastCrawlingTime = 0;

let actionQueue = []
async function checkActionQueue() {
  if (actionQueue.length == 0 && lastCrawlingTime < (new Date).getTime() + CRAWLING_DELAY) {
    lastCrawlingTime = (new Date).getTime();

    // since queue is empty, create a Spotify action
    let message = await spotify({ spotifyOffset: spotifyOffset });

    fs.writeFileSync('./data/spotify.json', JSON.stringify({ offset: spotifyOffset }));

    if (message.error == null) {
      const elements = message.data;
      spotifyOffset = spotifyOffset + ITEMS_TO_CRAWL;

      elements.forEach(element => {
        actionQueue.push({ type: 'spotify', job: element, id: getId(), host: host, priority: 0 });
      });

      actionQueue.sort(function(a,b) { return b.priority < a.priority });

      console.log('Successfully retrieved ' + elements.length + ' elements from Spotify. Offset is now at ' + spotifyOffset + '.');
    }
  }

  setTimeout(function() { checkActionQueue() }, CRAWLING_DELAY);
}

checkActionQueue();

function createActions() {
  if (actionQueue.length == 0) return;

  for (let i = 0; i < workers.length; i++) {
    const job = actionQueue[0];
    const host = workers[i].host;

    let res;
    try { res = syncRequest('POST', host + '/status') } catch(err) { continue };

    const body = JSON.parse(res.getBody('utf8'));
    const status = body.status;

    if (status == 'available') {
      console.log('Worker is available.')

      if (job.type == 'spotify') {
        request({ uri: host + '/spotify', method: 'POST', json: job }, function (error, response, body) {
          if (!error && response.statusCode == 200) {
            for (let j = 0; j < actionQueue.length; j++) {
              if (actionQueue[j].id == job.id) {
                actionQueue.splice(j, 1);

                break;
              }
            }
          }
        });
      }
      if (job.type == 'user') {
        request({ uri: host + '/user', method: 'POST', json: job }, function (error, response, body) {
          if (!error && response.statusCode == 200) {
            for (let j = 0; j < actionQueue.length; j++) {
              if (actionQueue[j].id == job.id) {
                actionQueue.splice(j, 1);

                break;
              }
            }
          }
        });
      }
    }
  }
}
setInterval(function() { createActions() }, 100);

router.post('/complete', koaBody(),
  function* (next) {
    console.log('/complete');

    this.body = JSON.stringify(this.request.body);
  }
);

router.post('/image', koaBody({
    jsonLimit: '10mb'
  }),
  function* (next) {
    console.log('/image');

    var id = getId();
    var path = '/data/images/' + id + '.jpg';

    actionQueue.push({ type: 'user', job: host + path, id: id, host: host, priority: 10, data: this.request.body.image });

    this.type = 'application/json';
    this.body = JSON.stringify({ error: null });
  }
);

function getId() { return (new Date).getTime() + '_' + String(Math.random()).split('.')[1] };