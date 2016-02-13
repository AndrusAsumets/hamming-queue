import fs from 'fs';
import syncRequest from 'sync-request';
import request from 'request';

//local imports
import { spotify } from './src/spotify';

let spotifyOffset;
try { spotifyOffset = JSON.parse(fs.readFileSync('./data/spotify.json')).offset
} catch (err) { spotifyOffset = 0 };

const ITEMS_TO_CRAWL = 50;
const CRAWLING_DELAY = 1000;
let lastCrawlingTime = 0;

let actionQueue = []
let workingQueue = [];
let completedQueue = [];

async function checkActionQueue() {
  if (actionQueue.length == 0 && lastCrawlingTime < (new Date).getTime() + CRAWLING_DELAY) {
    lastCrawlingTime = (new Date).getTime();

    // since queue is empty, create a Spotify action
    let message = await spotify({ spotifyOffset: spotifyOffset });

    fs.writeFileSync('./data/spotify.json', JSON.stringify({ offset: spotifyOffset }));

    if (message.error == null) {
      spotifyOffset = spotifyOffset + ITEMS_TO_CRAWL;

      const elements = message.data;

      elements.forEach(element => {
        const id = (new Date).getTime() + '_' + String(Math.random()).split('.')[1];
        actionQueue.push({ job: element, id: id });
      });

      console.log('Successfully retrieved ' + elements.length + ' from Spotify. Offset is at ' + spotifyOffset + '.');
    }
  }

  setTimeout(function() { checkActionQueue() }, CRAWLING_DELAY);
}

checkActionQueue();

var workers = [
  {
    name: 'localhost',
    host: 'http://127.0.0.1:6001',
    status: ''
  },
  {
    name: 'digitalocean',
    host: 'http://188.166.74.20:6001',
    status: ''
  }
]

async function createActions() {
  if (actionQueue.length == 0) return;

  //check worker availability
  for (let i = 0; i < workers.length; i++) {
    const job = actionQueue[0];
    const host = workers[i].host;
    const res = syncRequest('POST', host + '/working');
    const body = JSON.parse(res.getBody('utf8'));
    const status = body.status;

    if (status == 'available') {
      console.log('available')

      request({ uri: host + '/job', method: 'POST', json: job }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          actionQueue.splice(0, 1);

          workingQueue.push(job);
        }
      })

      break;
    }
  }
}
setInterval(function() { createActions() }, 0);

//web server
const port = 6000;
let app = require('koa')();
let router = require('koa-router')();
let koaBody = require('koa-body')();

router.post('/complete', koaBody,
  function *(next) {
    console.log('/complete');

    const job = this.request.body;

    for (let i = 0; i < workingQueue.length; i++) {
      if (workingQueue[i].id == job.id) {
        workingQueue.splice(0, i);
        completedQueue.push(job);

        console.log(completedQueue.length);
      }
    }

    this.body = JSON.stringify(this.request.body);
  }
);

app.use(router.routes());

app.listen(port);

console.log('Head is listening on', port);

