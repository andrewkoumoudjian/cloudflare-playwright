# Playwright Cloudflare Examples

This repository now includes two complementary ways to use Playwright with Cloudflare-friendly tooling:

1. A Cloudflare Worker example that captures TodoMVC screenshots and traces directly inside the Workers runtime.
2. A standalone Node.js Search API that runs Playwright behind an HTTP interface for full Chromium rendering (something you cannot do inside Workers themselves).

Use whichever component fits your workload—or combine them by putting the Worker in front of the Search API as a caching/auth proxy.

---

## 1. Cloudflare Worker – TodoMVC Screenshot & Trace

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/playwright/tree/main/packages/playwright-cloudflare/examples/todomvc)

This example demonstrates how to run Playwright-powered browser automation within a Cloudflare Worker using the TodoMVC application.

### Features

- Screenshots of TodoMVC app with custom todo items
- Optional trace generation
- Runs completely in Cloudflare Workers

### Setup

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Build the project:
   ```bash
   npm run build
   ```
3. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

### Usage

Once deployed, you can interact with the Worker using these URL patterns:

- **Capture Screenshot** – `https://<your-worker>.workers.dev`
- **Generate Trace** – `https://trace.playwright.dev/?trace=https://<your-worker>.workers.dev`
- **Download Trace** – `https://<your-worker>.workers.dev?trace`

---

## 2. Playwright Search API (Express)

The Search API is a production-minded example of exposing Playwright behind a simple HTTP service. It launches a single Chromium instance on startup, creates a new isolated context per request, and returns structured JSON with search results.

### Quick start (local)

1. Set an API key:
   ```bash
   export API_KEY=mysecret
   ```
2. Install dependencies (if you have already run `npm ci` for the Worker example this step is done):
   ```bash
   npm ci
   ```
3. Run the service:
   ```bash
   npm start
   ```
4. Make a request:
   ```bash
   curl 'http://localhost:3000/search?q=playwright&engine=duck' -H "x-api-key: mysecret"
   ```

### Docker

1. Build the image:
   ```bash
   docker build -t playwright-search-api .
   ```
2. Run the container:
   ```bash
   docker run -e API_KEY=mysecret -p 3000:3000 playwright-search-api
   ```

### Notes & operations checklist

- Reuse the browser instance. Do **not** launch Chromium per request.
- Limit concurrency with the `MAX_CONCURRENCY` environment variable.
- Add Redis/HTTP caching in front if you expect repeated queries.
- Respect target-site terms of service; prefer official APIs where available.
- Run behind an auth or caching proxy (Cloudflare Worker/Workers KV is a good fit) for better rate limiting and quota enforcement.
