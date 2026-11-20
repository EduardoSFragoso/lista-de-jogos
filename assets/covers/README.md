# Capas dos jogos

Uma imagem por jogo, nomeada pelo **id do jogo no banco**:

    assets/covers/<id>.jpg      (ou .png / .webp)

Exemplo: `assets/covers/49.jpg` aparece no card de _Adventure Quest_ (id 49).

- Sem capa o card fica sem thumb (o front tenta jpg → png → webp e desiste).
- Prefira `.jpg` com ~200 px de largura (fica 15–40 KB por jogo).
- Deploy é o mesmo push para o GitHub Pages — nada de serviço externo.
