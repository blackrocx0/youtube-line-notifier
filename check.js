const { parseStringPromise } = require('xml2js');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = 'UC7fk0CB07ly8oSl0aqKkqFg';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const LINE_API = 'https://api.line.me/v2/bot/message/push';
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const USER_IDS = [
  'Ub402589b5111e7a2c8e0a8864ccb2e60',
  'U92e23cd63e496b1e3b658237fac4215b'
];

const STATE_FILE = path.join(__dirname, 'state.json');

async function fetchWithRetry(url, options = {}, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...options.headers
  };
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { ...options, headers });
    if (res.ok) return res;
    console.warn(`Attempt ${i + 1} failed: HTTP ${res.status}`);
    if (i < retries - 1) await new Promise(r => setTimeout(r, 3000 * (i + 1)));
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

async function main() {
  // 抓取 YouTube RSS Feed
  console.log('Fetching YouTube RSS...');
  const res = await fetchWithRetry(RSS_URL);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml);

  const entries = parsed.feed.entry;
  if (!entries || entries.length === 0) {
    console.log('No videos found in RSS.');
    return;
  }

  const latest = entries[0];
  const videoId = latest['yt:videoId'][0];
  const title = latest.title[0];
  const published = latest.published[0];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`Latest video: [${videoId}] ${title}`);

  // 讀取上次狀態
  let state = { lastVideoId: '' };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }

  // 沒有新影片
  if (state.lastVideoId === videoId) {
    console.log('No new video. Nothing to do.');
    return;
  }

  // 第一次執行 - 只記錄，不通知
  if (state.lastVideoId === '') {
    console.log(`First run. Recording latest video ID: ${videoId}`);
    state.lastVideoId = videoId;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    return;
  }

  // 有新影片！發送通知
  console.log(`New video detected: ${title}`);
  const message = `🔴 中の人なんていないんだからね！\n\n📺 ${title}\n🔗 ${url}\n\n🕐 ${published}`;

  for (const userId of USER_IDS) {
    const response = await fetch(LINE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }]
      })
    });

    if (response.ok) {
      console.log(`Notified: ${userId}`);
    } else {
      const err = await response.text();
      console.error(`Failed to notify ${userId}: ${err}`);
    }
  }

  // 更新狀態
  state.lastVideoId = videoId;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('State updated.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
