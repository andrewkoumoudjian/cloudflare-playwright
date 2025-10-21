const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'changeme';
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '4', 10);

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 10 * 1000,
  max: 20,
});
app.use(limiter);

let activeRequests = 0;
let browser;

(async () => {
  try {
    console.log('Launching Playwright browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('Browser launched.');
  } catch (err) {
    console.error('Failed to launch browser', err);
    process.exit(1);
  }
})();

app.get('/search', async (req, res) => {
  const clientKey = req.header('x-api-key') || req.query.api_key;
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!browser || !browser.isConnected()) {
    return res.status(503).json({ error: 'Browser not ready' });
  }

  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Missing q parameter' });
  }

  if (activeRequests >= MAX_CONCURRENCY) {
    return res.status(429).json({ error: 'Too many concurrent requests' });
  }

  activeRequests++;
  try {
    const engine = (req.query.engine || 'duck').toLowerCase();
    let results;

    if (engine === 'duck') {
      results = await runDuckDuckGoSearch(q);
    } else if (engine === 'google') {
      results = await runGoogleSearch(q);
    } else {
      return res.status(400).json({ error: 'Unsupported engine' });
    }

    res.set('Cache-Control', 'public, max-age=30');
    return res.json({ query: q, engine, results, count: results.length });
  } catch (err) {
    console.error('Search error', err);
    return res.status(500).json({ error: 'Internal error' });
  } finally {
    activeRequests--;
  }
});

async function runDuckDuckGoSearch(q) {
  const page = await newContextPage();
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('#links', { timeout: 5000 }).catch(() => {});

    const results = await page.$$eval('.result', (nodes) => {
      return nodes
        .slice(0, 10)
        .map((node) => {
          const titleEl = node.querySelector('a.result__a');
          const snippetEl = node.querySelector('.result__snippet');
          const fallbackLink = node.querySelector('a');
          const href = titleEl ? titleEl.href : fallbackLink ? fallbackLink.href : '';
          return {
            title: titleEl ? titleEl.textContent.trim() : '',
            snippet: snippetEl ? snippetEl.textContent.trim() : '',
            url: href,
          };
        })
        .filter((result) => result.url);
    });

    await page.close();
    return results;
  } catch (err) {
    try {
      await page.close();
    } catch (closeErr) {
      console.error('Error closing DuckDuckGo page', closeErr);
    }
    throw err;
  }
}

async function runGoogleSearch(q) {
  const page = await newContextPage();
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('div#search', { timeout: 5000 }).catch(() => {});

    const results = await page.$$eval('div.g', (nodes) => {
      return nodes
        .slice(0, 10)
        .map((node) => {
          const anchor = node.querySelector('a');
          const titleEl = node.querySelector('h3');
          const snippetEl =
            node.querySelector('.IsZvec') || node.querySelector('.VwiC3b');
          return {
            title: titleEl ? titleEl.innerText.trim() : '',
            snippet: snippetEl ? snippetEl.innerText.trim() : '',
            url: anchor ? anchor.href : '',
          };
        })
        .filter((result) => result.url);
    });

    await page.close();
    return results;
  } catch (err) {
    try {
      await page.close();
    } catch (closeErr) {
      console.error('Error closing Google page', closeErr);
    }
    throw err;
  }
}

async function newContextPage() {
  const context = await browser.newContext({
    userAgent: 'playwright-search-api/1.0 (+https://example.com/bot)',
    viewport: { width: 1200, height: 800 },
  });

  await context.route('**/*', async (route) => {
    const resTypesToBlock = ['image', 'font', 'stylesheet'];
    if (resTypesToBlock.includes(route.request().resourceType())) {
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  const originalClose = page.close.bind(page);
  page.close = async () => {
    await originalClose();
    try {
      await context.close();
    } catch (err) {
      console.error('Error closing context', err);
    }
  };

  return page;
}

async function shutdown() {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.error('Error closing browser', err);
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  console.log(`Playwright search API listening on :${PORT}`);
});
