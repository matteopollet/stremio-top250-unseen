export function configurePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Top 250 Unseen — Configure</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; background: #0f0f12; color: #e8e8ec; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
  label { display: block; margin: 1rem 0 .3rem; font-size: .85rem; color: #aaa; }
  input[type=text], input[type=file] { width: 100%; box-sizing: border-box; padding: .5rem; border-radius: 6px; border: 1px solid #333; background: #1a1a20; color: #e8e8ec; }
  button { margin-top: 1.2rem; padding: .6rem 1.4rem; border: 0; border-radius: 6px; background: #7b5bf5; color: #fff; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .muted { color: #888; font-size: .82rem; }
  #results { margin-top: 1.5rem; display: none; }
  #install { margin-top: 1.5rem; padding: 1rem; border: 1px solid #2a2a35; border-radius: 8px; display: none; word-break: break-all; }
  code { background: #1a1a20; padding: .15rem .4rem; border-radius: 4px; font-size: .8rem; }
  table { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: .5rem; }
  td, th { text-align: left; padding: .3rem .4rem; border-bottom: 1px solid #222; }
</style>
</head>
<body>
<h1>IMDb Top 250 — À voir</h1>
<p class="muted">Generates a Stremio catalog: the IMDb Top 250 minus the films you have already seen.</p>

<h2>1 · Letterboxd export (your full history)</h2>
<p class="muted">Get it at <code>letterboxd.com/data/export/</code> → unzip → select <code>watched.csv</code>, <code>ratings.csv</code> and <code>diary.csv</code>. <strong>The files are processed locally in your browser — your watch history is never sent to this server.</strong></p>
<label>Letterboxd CSV export files</label>
<input type="file" id="csvFiles" multiple accept=".csv">

<h2>2 · Live updates (optional)</h2>
<label>Letterboxd username (public profile — keeps the catalog fresh as you log new films)</label>
<input type="text" id="username" placeholder="your-letterboxd-username">
<label>TMDB API key (optional — improves ID resolution)</label>
<input type="text" id="tmdbKey" placeholder="leave empty">

<h2>3 · Generate</h2>
<button id="go">Match my films &amp; generate addon</button>

<div id="results">
  <h2>Matching report</h2>
  <p id="summary"></p>
  <div id="ambiguous"></div>
  <button id="confirm">Confirm &amp; install</button>
</div>

<div id="install">
  <p><strong>Your addon is ready.</strong></p>
  <p><a id="stremioLink" href="#">Open in Stremio</a></p>
  <p class="muted">or copy the manifest URL:</p>
  <p><code id="manifestUrl"></code></p>
</div>

<script src="/configure.js"></script>
</body>
</html>`;
}
