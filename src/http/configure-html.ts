export function configurePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="The IMDb Top 250, minus the films you have already seen on Letterboxd — installed as a Stremio catalog.">
<title>Top 250 Unseen — Configure</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  color-scheme: dark;
  --fs: 15px;
  --fs-sm: 13px;
  --fs-micro: 11.5px;
  --bone: #E9E5D8;
  --bone-72: rgba(233,229,216,.72);
  --bone-50: rgba(233,229,216,.5);
  --bone-32: rgba(233,229,216,.32);
  --bone-16: rgba(233,229,216,.16);
  --plate: #16161B;
  --well: #101014;
  --edge: rgba(233,229,216,.12);
  --w405: #7B61FF; --w436: #3D7BFF; --w486: #29C8E8; --w546: #3DDC84;
  --w589: #FFC53D; --w615: #FF7A29; --w656: #FF3B30;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { background: #0D0D10; }
body {
  margin: 0;
  font-family: "Barlow", system-ui, sans-serif;
  font-size: var(--fs);
  line-height: 1.55;
  font-feature-settings: "tnum";
  color: var(--bone);
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.008) 0 2px, transparent 2px 7px),
    repeating-linear-gradient(90deg, transparent 0 11px, rgba(0,0,0,.08) 11px 13px, transparent 13px 29px),
    linear-gradient(180deg, #131317 0%, #0D0D10 55%, #0B0B0E 100%);
  background-attachment: fixed;
  min-height: 100vh;
}
::selection { background: var(--w589); color: #0D0D10; }
:focus-visible { outline: 1px solid var(--bone); outline-offset: 3px; }
a { color: var(--bone); text-underline-offset: 3px; text-decoration-color: var(--bone-32); }
a:hover { text-decoration-color: var(--bone); }
code { font-family: inherit; font-feature-settings: "tnum"; background: var(--well); border: 1px solid var(--edge); padding: 1px 5px; }
input, button { font: inherit; color: inherit; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bone-16); border: 3px solid #0D0D10; border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: var(--bone-32); }

/* ---------- rail ---------- */
.railwrap {
  position: sticky; top: 0; z-index: 20;
  border-bottom: 1px solid var(--edge);
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.008) 0 2px, transparent 2px 7px),
    repeating-linear-gradient(90deg, transparent 0 11px, rgba(0,0,0,.08) 11px 13px, transparent 13px 29px),
    linear-gradient(180deg, #15151A 0%, #111115 100%);
}
.legend {
  display: flex; align-items: baseline; gap: 16px;
  max-width: 840px; margin: 0 auto; padding: 10px 20px 0;
}
h1.brand { margin: 0; font-size: var(--fs-sm); letter-spacing: .16em; font-weight: 600; }
.legend .legend-counts { margin-left: auto; display: flex; gap: 12px;
  font-size: var(--fs-micro); color: var(--bone-32); white-space: nowrap; }
.legend .legend-counts b { font-weight: 600; color: var(--bone-72); }
.legend .legend-counts .lc-contest b { color: var(--w589); }
.railview { max-width: 840px; margin: 0 auto; padding: 0 20px; overflow-x: auto; scrollbar-width: none; }
.railview::-webkit-scrollbar { display: none; }
.railtrack { position: relative; height: 66px; min-width: 600px; }
.ln {
  position: absolute; bottom: 18px; width: 1px; height: 36px;
  background: var(--bone); opacity: .45;
  transform-origin: bottom;
  transition: transform .45s cubic-bezier(.2,.9,.3,1), opacity .45s, background-color .3s;
}
.ln.out { transform: scaleY(.32); opacity: .14; }
.ln.out.manual { transform: none; opacity: .28; }
.ln.out.manual::after {
  content: ""; position: absolute; left: -3px; bottom: 17px; width: 7px; height: 1px;
  background: var(--bone-72); transform: rotate(-45deg);
}
.ln.contested, .ln.contested::before {
  background: repeating-linear-gradient(to bottom, var(--w589) 0 3px, transparent 3px 6px);
}
.ln.contested { opacity: .95; }
.ln.contested::before {
  content: ""; position: absolute; left: 3px; top: 0; bottom: 0; width: 1px;
}
.ln.next, .ln.next::before { background: var(--w656); }
.ln.next { transform: scaleY(1.3); opacity: 1; }
.ln.next::before { content: ""; position: absolute; left: 3px; top: 0; bottom: 0; width: 1px; }
.ln.focus:not(.out) { opacity: .95; }
.ln.out.focus { opacity: .4; }
.scan {
  position: absolute; top: 4px; bottom: 14px; left: 0; width: 1px;
  background: var(--w486); opacity: 0; pointer-events: none;
}
.scan.on { opacity: 1; }
.tk { position: absolute; bottom: 15px; width: 1px; height: 4px; background: var(--bone-32); }
.tl {
  position: absolute; bottom: 0; font-size: var(--fs-micro);
  color: var(--bone-32); transform: translateX(-50%);
}
.tl.first { transform: none; }
.tl.last { transform: translateX(-100%); }

/* rail legend — the key to the line states, always visible */
.railegend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px 18px;
  max-width: 840px; margin: 0 auto; padding: 0 20px 9px;
  font-size: var(--fs-micro); color: var(--bone-32);
}
.railegend > span { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.sw { position: relative; display: inline-block; width: 5px; height: 12px; flex: none; }
.sw::before { content: ""; position: absolute; left: 2px; bottom: 0; width: 1px; height: 12px; }
.sw-live::before { background: var(--bone); }
.sw-out::before { height: 4px; background: var(--bone-32); }
.sw-manual::before { background: var(--bone-32); }
.sw-manual::after {
  content: ""; position: absolute; left: 0; bottom: 6px; width: 5px; height: 1px;
  background: var(--bone-72); transform: rotate(-45deg);
}
.sw-contest::before, .sw-contest::after {
  content: ""; position: absolute; bottom: 0; top: 0; width: 1px;
  background: repeating-linear-gradient(to bottom, var(--w589) 0 2px, transparent 2px 4px);
}
.sw-contest::before { left: 1px; }
.sw-contest::after { left: 4px; }
.sw-next::before, .sw-next::after { content: ""; position: absolute; bottom: 0; top: 0; width: 1px; background: var(--w656); }
.sw-next::before { left: 1px; }
.sw-next::after { left: 4px; }

/* ---------- sheet ---------- */
main { max-width: 840px; margin: 0 auto; padding: 28px 20px 100px; }
.lede { margin: 0 0 28px; font-size: 16px; color: var(--bone-72); max-width: 56ch; }
.notice {
  display: flex; align-items: baseline; gap: 12px;
  padding: 13px 16px; margin: 0 0 14px;
  background: var(--plate); border: 1px solid var(--edge);
  color: var(--bone-72);
}
.notice::before { content: ""; flex: none; align-self: center; width: 1px; height: 15px; background: var(--bone-50); }
.notice.err { color: #FF8A7A; }
.notice.err::before { background: var(--w656); box-shadow: 3px 0 0 var(--w656); }

/* ---------- plates ---------- */
.plate { background: var(--plate); border: 1px solid var(--edge); margin: 0 0 14px; }
h2.ph { margin: 0; font: inherit; }
.plate-head {
  display: flex; align-items: baseline; gap: 12px; width: 100%;
  padding: 15px 18px; border: 0; background: none; text-align: left;
  font-size: 17px; font-weight: 600; cursor: pointer; color: var(--bone);
}
.plate-head:hover { color: #fff; }
.plate-head .tick { flex: none; align-self: center; width: 1px; height: 15px; background: var(--bone); }
.plate:not(.open) .plate-head .tick { height: 6px; background: var(--bone-32); }
.plate-head .opt { font-weight: 400; color: var(--bone-32); font-size: var(--fs-sm); }
.plate-head .residue { margin-left: auto; font-weight: 400;
  font-size: var(--fs-sm); color: var(--bone-32); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plate-body { padding: 4px 18px 20px; border-top: 1px solid var(--edge); }
.plate:not(.open) .plate-body { display: none; }
.plate-body > p { color: var(--bone-72); margin: 12px 0; max-width: 62ch; }
.plate-body .dim { color: var(--bone-32); font-size: var(--fs-sm); }

/* ---------- drop zone ---------- */
.drop {
  position: relative; margin: 14px 0 14px; padding: 34px 20px;
  border: 1px dashed var(--bone-32); background: var(--well);
  text-align: center; cursor: pointer;
}
.drop:hover, .drop:focus-within { border-color: var(--bone-50); }
.drop.over { border-style: solid; border-color: var(--w486); }
.drop.over::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 5px, rgba(41,200,232,.05) 5px 6px);
}
.drop input[type=file] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.drop .drop-label { font-size: 16px; font-weight: 600; pointer-events: none; }
.drop .drop-hint { display: block; margin-top: 6px; color: var(--bone-32); font-size: var(--fs-sm); pointer-events: none; }
.filestubs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; }
.fstub {
  display: inline-flex; align-items: baseline; gap: 9px;
  padding: 8px 12px; border: 1px solid var(--edge); background: var(--well);
  font-size: var(--fs-sm);
}
.fstub::before { content: ""; width: 1px; height: 12px; align-self: center; background: var(--bone); }
.fstub.bad::before { background: repeating-linear-gradient(to bottom, var(--w589) 0 2px, transparent 2px 4px); }
.fstub .n { color: var(--bone-32); }
.fstub.bad .n { color: var(--w589); }

/* ---------- fields ---------- */
.field { margin: 14px 0 0; max-width: 400px; }
.field label { display: block; font-size: var(--fs-sm); color: var(--bone-72); margin-bottom: 7px; }
.field .hint { color: var(--bone-32); }
.field input {
  width: 100%; padding: 11px 12px; background: var(--well);
  border: 1px solid var(--edge); border-radius: 0; color: var(--bone);
  caret-color: var(--w486);
}
.field input:focus { outline: none; border-color: var(--bone-50); }
.field input::placeholder { color: var(--bone-32); }

/* ---------- actions ---------- */
.act {
  display: inline-flex; align-items: center; gap: 10px;
  margin: 8px 0 4px; padding: 13px 24px;
  border: 1px solid var(--bone); border-radius: 0;
  background: var(--bone); color: #0D0D10;
  font-weight: 600; font-size: 15px; text-decoration: none; cursor: pointer;
}
.act::before { content: ""; width: 1px; height: 14px; background: #0D0D10; }
.act:hover:not(:disabled) { background: #fff; border-color: #fff; }
.act:disabled { background: none; border-color: var(--bone-16); color: var(--bone-32); cursor: default; }
.act:disabled::before { background: var(--bone-16); }
.act.ghost { background: none; color: var(--bone); border-color: var(--bone-32); padding: 11px 18px; font-size: var(--fs-sm); }
.act.ghost::before { background: var(--bone-32); height: 11px; }
.act.ghost:hover:not(:disabled) { background: none; border-color: var(--bone); color: var(--bone); }
.stage { color: var(--bone-32); font-size: var(--fs-sm); margin-left: 14px; }

/* ---------- report ---------- */
#summary { font-size: 16px; }
.countline { display: flex; flex-wrap: wrap; gap: 10px 30px; margin: 16px 0 6px; }
.countline .c b { font-weight: 600; font-size: 21px; }
.countline .c .k { display: block; margin-top: 1px; font-size: var(--fs-sm); color: var(--bone-32); }
.countline .c.contest b { color: var(--w589); }
.subhead { margin: 26px 0 6px; font-size: 15px; font-weight: 600; }
.subhead .dim { font-weight: 400; color: var(--bone-32); margin-left: 10px; }

/* contested rows */
.ctrow { display: grid; grid-template-columns: minmax(150px, 1fr) 1.8fr; gap: 8px 26px; padding: 16px 0; border-top: 1px solid var(--edge); }
.ctrow .entry { padding-top: 9px; }
.ctrow .entry .n { display: block; font-size: 16px; font-weight: 600; }
.ctrow .entry .y { color: var(--bone-32); font-weight: 400; }
.ctrow .entry .rs { display: block; margin-top: 4px; color: var(--bone-32); font-size: var(--fs-sm); }
.ctrow .cands { display: flex; flex-direction: column; gap: 8px; }
.cand {
  position: relative; display: flex; align-items: center; gap: 12px;
  padding: 11px 14px; border: 1px solid var(--edge); background: var(--well);
  cursor: pointer; color: var(--bone-72);
}
.cand:hover { border-color: var(--bone-32); color: var(--bone); }
.cand .ct { font-size: 15px; }
.cand .cy { color: var(--bone-32); font-size: var(--fs-sm); }
.cand:has(input:checked) { border-color: var(--w589); color: var(--bone); }
.cand:has(input:checked)::after {
  content: "counts as seen"; margin-left: auto;
  color: var(--w589); font-size: var(--fs-sm); white-space: nowrap;
}

/* the strike checkbox: a stub that rises to a full line */
.mk { position: relative; flex: none; width: 12px; height: 20px; }
.mk::before {
  content: ""; position: absolute; left: 5px; bottom: 2px; width: 1px; height: 17px;
  background: var(--bone-32); transform: scaleY(.41); transform-origin: bottom;
  transition: transform .25s cubic-bezier(.2,.9,.3,1), background-color .2s;
}
input:checked + .mk::before { transform: scaleY(1); background: var(--bone); }
input:focus-visible + .mk { outline: 1px solid var(--bone); outline-offset: 3px; }
input.x + .mk::before, input:checked.x + .mk::before { background: var(--w589); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- seen list ---------- */
.filterrow { display: flex; align-items: center; gap: 16px; margin: 12px 0 0; }
.filterrow input {
  flex: 1; max-width: 320px; padding: 10px 12px; background: var(--well);
  border: 1px solid var(--edge); color: var(--bone); caret-color: var(--w486);
}
.filterrow input:focus { outline: none; border-color: var(--bone-50); }
.filterrow input::placeholder { color: var(--bone-32); }
.filterrow .tally { margin-left: auto; font-size: var(--fs-sm); color: var(--bone-32); white-space: nowrap; }
.filterrow .tally b { color: var(--bone); font-weight: 600; }
.seenlist { margin-top: 12px; max-height: 380px; overflow-y: auto; border: 1px solid var(--edge); background: var(--well); }
.seenrow {
  position: relative;
  display: flex; align-items: center; gap: 14px; padding: 12px 16px;
  border-bottom: 1px solid rgba(233,229,216,.06); cursor: pointer;
}
.seenrow:last-child { border-bottom: 0; }
.seenrow:hover { background: rgba(233,229,216,.04); }
.seenrow .rk { flex: none; width: 40px; color: var(--bone-32); font-size: var(--fs-sm); }
.seenrow .tt { color: var(--bone); font-size: 15px; }
.seenrow .yr { color: var(--bone-32); margin-left: 7px; font-size: var(--fs-sm); }
.seenrow.struck .tt, .seenrow.struck .yr { color: var(--bone-32); text-decoration: line-through; text-decoration-color: var(--bone-32); }
.seenrow.struck::after {
  content: "marked seen"; margin-left: auto;
  color: var(--bone-32); font-size: var(--fs-sm); white-space: nowrap;
}

/* ---------- install ---------- */
.survive { margin: 14px 0 2px; color: var(--bone-72); }
.survive b { font-weight: 600; color: var(--bone); }
.nextline { margin: 20px 0 6px; }
.nextline .nl-k { display: block; color: var(--bone-32); font-size: var(--fs-sm); margin-bottom: 8px; }
.nextline .nl-r { color: var(--w656); font-size: 20px; font-weight: 600; margin-right: 14px; }
.nextline .nl-t { font-size: 32px; line-height: 1.15; font-weight: 600; }
.nextline .nl-y { color: var(--bone-32); font-size: 20px; margin-left: 10px; }
.installrow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 22px; }
.installrow .act { padding: 15px 34px; font-size: 16px; }
.urlwell {
  display: flex; align-items: center; gap: 10px;
  margin-top: 14px; padding: 10px 12px; background: var(--well); border: 1px solid var(--edge);
}
.urlwell code { flex: 1; background: none; border: 0; padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--bone-50); font-size: var(--fs-sm); }
.copybtn { border: 0; background: none; padding: 2px 0; font-size: var(--fs-sm);
  color: var(--bone-72); cursor: pointer; }
.copybtn:hover { color: var(--bone); }

footer { max-width: 840px; margin: 0 auto; padding: 0 20px 44px; color: var(--bone-32); font-size: var(--fs-sm); }

@media (max-width: 640px) {
  .railtrack { min-width: 560px; }
  .ctrow { grid-template-columns: 1fr; }
  .ctrow .entry { padding-top: 0; }
  .legend { flex-wrap: wrap; gap: 4px 12px; }
  .nextline .nl-t { font-size: 26px; }
  main { padding-bottom: 70px; }
}
@media (prefers-reduced-motion: reduce) {
  .ln, .mk::before, .scan { transition: none !important; }
}
</style>
</head>
<body>

<header class="railwrap">
  <div class="legend">
    <h1 class="brand">TOP 250 UNSEEN</h1>
    <span class="legend-counts" aria-hidden="true">
      <span class="lc-live"><b id="ctLive">250</b> on the rail</span>
      <span class="lc-struck"><b id="ctStruck">0</b> struck</span>
      <span class="lc-contest"><b id="ctContest">0</b> contested</span>
    </span>
    <span id="railStatus" class="sr" role="status">250 films on the rail.</span>
  </div>
  <div class="railview" id="railView" aria-hidden="true">
    <div class="railtrack" id="railTrack"><div class="scan" id="scan"></div></div>
  </div>
  <div class="railegend" aria-hidden="true">
    <span><i class="sw sw-live"></i>still in your Top 250</span>
    <span><i class="sw sw-out"></i>already watched</span>
    <span><i class="sw sw-contest"></i>needs your review</span>
    <span><i class="sw sw-manual"></i>marked as seen</span>
    <span><i class="sw sw-next"></i>your next film</span>
  </div>
</header>

<main>
  <p class="lede">Generates a Stremio catalog: the IMDb Top 250, minus the films you have already seen. Watched films drop off the rail — what remains is your canon.</p>

  <p id="reconfig" class="notice" hidden>This addon is already configured — saved exclusions load when you run the match below. Update them and confirm to keep the same install URL.</p>
  <p id="notice" class="notice err" hidden></p>

  <section class="plate open" id="plateImport">
    <h2 class="ph"><button class="plate-head" id="headImport" aria-expanded="true" aria-controls="bodyImport">
      <i class="tick"></i>Import<span class="residue" id="importResidue"></span>
    </button></h2>
    <div class="plate-body" id="bodyImport">
      <p>Get your export at <code>letterboxd.com/data/export/</code> → unzip → drop <code>watched.csv</code>, <code>ratings.csv</code> and <code>diary.csv</code>. <strong>Files are parsed in your browser — your watch history never reaches this server.</strong></p>
      <div class="drop" id="drop">
        <input type="file" id="csvFiles" multiple accept=".csv" aria-label="Letterboxd CSV export files">
        <span class="drop-label">Drop your CSV exports here</span>
        <span class="drop-hint">or click to browse — watched.csv · ratings.csv · diary.csv</span>
      </div>
      <div class="filestubs" id="fileStubs"></div>
    </div>
  </section>

  <section class="plate" id="plateOptions">
    <h2 class="ph"><button class="plate-head" id="headOptions" aria-expanded="false" aria-controls="bodyOptions">
      <i class="tick"></i>Live updates<span class="opt">(optional)</span><span class="residue" id="optionsResidue"></span>
    </button></h2>
    <div class="plate-body" id="bodyOptions" hidden>
      <div class="field">
        <label for="username">Letterboxd username <span class="hint">— public profile; picks up new diary entries &amp; reviews automatically</span></label>
        <input type="text" id="username" placeholder="your-letterboxd-username" autocomplete="off">
      </div>
      <div class="field">
        <label for="tmdbKey">TMDB API key <span class="hint">— optional; improves ID resolution</span></label>
        <input type="text" id="tmdbKey" placeholder="leave empty" autocomplete="off">
      </div>
      <p class="dim">Letterboxd's RSS feed updates on its own schedule (observed lag: up to ~1h), and films only marked with the eye icon may not appear in it. For an immediate effect, use the strike list after matching.</p>
    </div>
  </section>

  <section class="plate open" id="plateMatch">
    <h2 class="ph"><button class="plate-head" id="headMatch" aria-expanded="true" aria-controls="bodyMatch">
      <i class="tick"></i>Match<span class="residue" id="matchResidue"></span>
    </button></h2>
    <div class="plate-body" id="bodyMatch">
      <button id="go" class="act">Run the match</button>
      <span class="stage" id="stage" aria-live="polite"></span>
    </div>
  </section>

  <section class="plate" id="results" hidden>
    <h2 class="ph"><button class="plate-head" id="headReview" aria-expanded="false" aria-controls="bodyReview">
      <i class="tick"></i>Review<span class="residue" id="reviewResidue"></span>
    </button></h2>
    <div class="plate-body" id="bodyReview">
      <p id="summary"></p>
      <div class="countline" id="countline"></div>
      <div id="ambiguous"></div>

      <h3 class="subhead">Still on the rail<span class="dim">— seen it but never logged it? strike it and it drops off</span></h3>
      <div class="filterrow">
        <input type="text" id="seenFilter" placeholder="Filter titles…" aria-label="Filter titles">
        <span class="tally" id="tally"></span>
      </div>
      <div class="seenlist" id="seenList"></div>

      <button id="confirm" class="act">Confirm &amp; install</button>
      <span class="stage" id="stage2"></span>
    </div>
  </section>

  <section class="plate" id="install" hidden>
    <h2 class="ph"><button class="plate-head" id="headInstall" aria-expanded="false" aria-controls="bodyInstall">
      <i class="tick"></i>Install<span class="residue" id="installResidue"></span>
    </button></h2>
    <div class="plate-body" id="bodyInstall">
      <p class="survive" id="survive"></p>
      <div class="nextline" id="nextline" hidden>
        <span class="nl-k">Next on the rail</span>
        <span><span class="nl-r" id="nlR"></span><span class="nl-t" id="nlT"></span><span class="nl-y" id="nlY"></span></span>
      </div>
      <div class="installrow">
        <a id="stremioLink" class="act" href="#">Open in Stremio</a>
      </div>
      <p class="dim">or copy the manifest URL:</p>
      <div class="urlwell">
        <code id="manifestUrl"></code>
        <button class="copybtn" id="copyBtn" type="button">Copy</button>
      </div>
      <p class="dim">Bookmark <a id="configureLink" href="#">this page's configure URL</a> to update your exclusions later.</p>
    </div>
  </section>
</main>

<footer>Processed in your browser — only IMDb ids ever leave this page.</footer>

<script src="/configure.js"></script>
</body>
</html>`;
}
