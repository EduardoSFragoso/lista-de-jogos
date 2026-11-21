/* Testes das funções puras de fetch-covers — matching de nomes de capas
   (Libretro / xero/boxart), normalização e mapa de pastas. Sem rede.
   Rodar: npm test (vitest run). */
import { describe, expect, it } from 'vitest';

const { norm, normKey, libretroSystems, boxartFolders, titleBases, matchNamed } =
  await import('../tools/fetch-covers.mjs');

/* mapa fake no formato das listagens: filename No-Intro → entrada com get() */
function fakeMap(files) {
  const map = new Map();
  for (const f of files) {
    const name = f.replace(/\.png$/, '');
    map.set(norm(name), { path: f, get: () => ({ file: f }) });
  }
  return map;
}

describe('boxartFolders / libretroSystems — mapeia plataforma → sistemas', () => {
  it('Mega Drive/Genesis → MD (boxart) e libretro Mega Drive', () => {
    expect(boxartFolders('Mega Drive')).toEqual(['MD']);
    expect(boxartFolders('Sega Genesis')).toEqual(['MD']);
    expect(libretroSystems('Mega Drive')).toContain('Sega - Mega Drive - Genesis');
  });

  it("'genesis' não vira NES (\\b evita falso 'geNESis')", () => {
    expect(boxartFolders('Mega Drive / Genesis')).not.toContain('NES');
  });

  it('Game Boy família → pasta certa para cada um', () => {
    expect(boxartFolders('Game Boy Advance')).toEqual(['GBA']);
    expect(boxartFolders('Game Boy Color')).toEqual(['GBC']);
    expect(boxartFolders('Game Boy')).toEqual(['GB']);
  });

  it('plataforma sem pasta no boxart → vazio (fica pro Libretro/SGDB)', () => {
    expect(boxartFolders('N64')).toEqual([]);
    expect(boxartFolders('PC')).toEqual([]);
    expect(boxartFolders('')).toEqual([]);
  });
});

describe('matchNamed — 3 estágios do match por nome', () => {
  const map = fakeMap([
    'Legend of Zelda, The - A Link to the Past (USA).png',
    'Super Mario World (USA, Europe).png',
    'Super Mario World 2 - Yoshi Island (USA).png',
    'Super Mario Kart (Europe).png',
  ]);

  it('estágio 1: nome com variantes ("The" pro fim, dois-pontos) casa exato', () => {
    const got = matchNamed(map, titleBases('Legend of Zelda, The - A Link to the Past'));
    expect(got.path).toBe('Legend of Zelda, The - A Link to the Past (USA).png');
  });

  it('estágio 1: nomes equivalentes por normalização', () => {
    expect(
      matchNamed(map, titleBases('Legend of Zelda, The - A Link to the Past (USA)'))
    ).toBeTruthy();
  });

  it('estágio 2: prefixo pega o mais curto (jogo, não sequência)', () => {
    const got = matchNamed(map, titleBases('Super Mario World'));
    expect(got.path).toBe('Super Mario World (USA, Europe).png');
  });

  it('estágio 3: prefixo com espaço acha edição citada no nome', () => {
    const map2 = fakeMap(['Super Mario Kart (Europe).png']);
    expect(matchNamed(map2, titleBases('Super')).path).toBe('Super Mario Kart (Europe).png');
  });

  it('nada casa → null', () => {
    expect(matchNamed(map, titleBases('Adventure Quest'))).toBeNull();
  });
});

describe('norm / normKey', () => {
  it('norm mantém espaços; normKey junta tudo', () => {
    expect(norm('Pokémon É Chapéu')).toBe('pokemon e chapeu');
    expect(normKey('Pokémon X & Y')).toBe('pokemonxy');
  });
});
