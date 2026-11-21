/* Busca appids na Steam pra uma lista de títulos. Uso: node tools/steam-lookup.mjs "T1" "T2" */
const titles = process.argv.slice(2);
for (const title of titles) {
  try {
    const res = await fetch(
      `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(title)}`
    );
    const list = await res.json();
    console.log(`\n--- ${title}`);
    for (const x of (list || []).slice(0, 6)) {
      let year = '';
      try {
        const r2 = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${x.appid}&l=english`
        );
        const j = await r2.json();
        const d = j[String(x.appid)]?.data;
        year = d ? ` | ${d.release_date?.date}` : '';
      } catch {}
      console.log(`${x.appid} | ${x.name}${year}`);
    }
  } catch (e) {
    console.log(`${title}: ERRO ${e.message}`);
  }
}
