-- Patch: engines aplicadas (29 jogos) — só engine, não toca em rating/review
-- Rodar no SQL Editor do Neon (ou psql $DATABASE_URL -f data/patch-engines.sql)

UPDATE games SET engine = 'Adobe Flash' WHERE id = 16;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 33;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 39;
UPDATE games SET engine = 'SCI2.1' WHERE id = 61;
UPDATE games SET engine = 'Jade' WHERE id = 71;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 102;
UPDATE games SET engine = 'Unity' WHERE id = 146;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 153;
UPDATE games SET engine = 'Proprietária (Nintendo)' WHERE id = 154;
UPDATE games SET engine = 'Unreal Engine' WHERE id = 166;
UPDATE games SET engine = 'Unreal Engine' WHERE id = 172;
UPDATE games SET engine = 'Proprietária (Atari)' WHERE id = 174;
UPDATE games SET engine = 'Unity' WHERE id = 181;
UPDATE games SET engine = 'XNA' WHERE id = 182;
UPDATE games SET engine = 'Unreal Engine' WHERE id = 195;
UPDATE games SET engine = 'Proprietária (Capcom)' WHERE id = 196;
UPDATE games SET engine = 'Proprietária (Iron Lore)' WHERE id = 208;
UPDATE games SET engine = 'PopCap Framework' WHERE id = 223;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 231;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 237;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 241;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 262;
UPDATE games SET engine = 'Proprietária (Neversoft)' WHERE id = 263;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 268;
UPDATE games SET engine = 'Proprietária (não documentada)' WHERE id = 270;
UPDATE games SET engine = 'Proprietária (EA)' WHERE id = 272;
UPDATE games SET engine = 'Proprietária (Neversoft)' WHERE id = 275;
UPDATE games SET engine = 'WangReal Engine' WHERE id = 279;
UPDATE games SET engine = 'Proprietária (Team17)' WHERE id = 281;
