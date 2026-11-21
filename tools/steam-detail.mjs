/* Detalhes de appids: nome, ano, developer. Uso: node tools/steam-detail.mjs 1595710 1695840 */
for (const appid of process.argv.slice(2)) {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`
    );
    const j = await res.json();
    const d = j[appid]?.data;
    console.log(
      appid,
      '|',
      d
        ? `${d.name} | ${d.release_date?.date} | dev: ${(d.developers || []).join(', ')} | pub: ${(d.publishers || []).join(', ')}`
        : 'FALHOU'
    );
  } catch (e) {
    console.log(appid, 'ERRO', e.message);
  }
}
