-- ============================================================
-- Lista de Jogos — schema do Neon (PostgreSQL)
-- Rode este arquivo no SQL Editor do Neon, depois rode seed.sql
-- ============================================================

create table if not exists games (
  id         integer primary key,
  title      text not null,                          -- título original (EN)
  title_pt   text,                                   -- título secundário (PT-BR)
  year       smallint check (year is null or (year between 1950 and 2100)),
  platform   text,
  engine     text,
  rating     smallint check (rating is null or (rating between 1 and 5)),
  company    text,
  genre      text,
  mode       text,
  review     text,
  updated_at timestamptz not null default now()
);

create index if not exists games_title_idx on games (title);
