/** Starting points for the custom code widget. */
export const CODE_TEMPLATES: { name: string; html: string }[] = [
	{
		name: "Counter (saves state)",
		html: `<div class="wrap">
  <button id="add">Clicked <b id="count">0</b> times</button>
</div>

<style>
  .wrap { display: grid; place-items: center; padding: 16px; }
  button {
    padding: 10px 16px; border: 0; border-radius: 12px;
    background: var(--accent); color: white; cursor: pointer;
  }
</style>

<script>
  // tabz.state is whatever you last passed to tabz.save().
  let count = tabz.state?.count ?? 0;
  const label = document.getElementById("count");
  label.textContent = count;
  document.getElementById("add").onclick = () => {
    count++;
    label.textContent = count;
    tabz.save({ count });
  };
</script>`,
	},
	{
		name: "Live data (JSON API)",
		html: `<div id="prices">Loading…</div>

<style>
  .row { display: flex; justify-content: space-between; padding: 6px 2px; }
  .row + .row { border-top: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); }
  .coin { text-transform: capitalize; }
</style>

<script>
  // tabz.fetch goes through the tabz server: no CORS problems, cached briefly.
  tabz
    .fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd")
    .then((data) => {
      document.getElementById("prices").innerHTML = Object.entries(data)
        .map(([coin, price]) =>
          \`<div class="row"><span class="coin">\${coin}</span><b>$\${price.usd.toLocaleString()}</b></div>\`)
        .join("");
    })
    .catch((error) => {
      document.getElementById("prices").textContent = error.message;
    });
</script>`,
	},
	{
		name: "Digital clock",
		html: `<div id="clock"></div>
<div id="date"></div>

<style>
  body { text-align: center; padding: 12px 0; }
  #clock { font-size: 40px; font-weight: 600; font-variant-numeric: tabular-nums; }
  #date { color: var(--muted); }
</style>

<script>
  const tick = () => {
    const now = new Date();
    document.getElementById("clock").textContent = now.toLocaleTimeString();
    document.getElementById("date").textContent = now.toLocaleDateString(undefined, { dateStyle: "full" });
  };
  tick();
  setInterval(tick, 1000);
</script>`,
	},
	{
		name: "Progress ring",
		html: `<svg viewBox="0 0 120 120" width="140" height="140">
  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-opacity=".1" stroke-width="12"/>
  <circle id="ring" cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="12"
    stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="314" />
  <text id="label" x="60" y="66" text-anchor="middle" font-size="20" font-weight="600" fill="currentColor"></text>
</svg>
<p id="caption"></p>

<style>
  body { display: grid; place-items: center; padding: 8px 0; }
  p { margin: 4px 0 0; color: var(--muted); }
</style>

<script>
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  const done = (now - start) / (end - start);
  document.getElementById("ring").style.strokeDashoffset = 314 * (1 - done);
  document.getElementById("label").textContent = Math.round(done * 100) + "%";
  document.getElementById("caption").textContent = now.getFullYear() + " is this far along";
</script>`,
	},
	{
		name: "Blank",
		html: `<div>Hello from my widget!</div>

<style>
  div { padding: 12px; }
</style>

<script>
  // Your code here.
</script>`,
	},
];
