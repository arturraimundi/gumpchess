# Gump Chess

Minigame de xadrez monocromático para navegador, publicado via GitHub Pages.

## Bots

O jogo possui três oponentes:

- `BOT_01`: nível médio, usando o avatar atual em `icon/icon.jpg`.
- `ROOKIE`: nível fácil, com placeholder enquanto não houver avatar.
- `ORACLE`: nível difícil, com placeholder enquanto não houver avatar.

O botão `BOT DO DIA` escolhe um oponente automaticamente com base na data atual. A seleção vale para a próxima partida.

### Alterar os ícones

Para adicionar avatares aos bots novos, coloque os arquivos na pasta `icon/` e altere a propriedade `avatar` correspondente no objeto `bots` em `script.js`:

```js
rookie: { avatar: 'icon/rookie.jpg' }
oracle: { avatar: 'icon/oracle.jpg' }
```

## Desenvolvimento

Abra `index.html` diretamente ou rode `python3 -m http.server 4173` e acesse `http://localhost:4173`.

© 2026 Artur Gump
