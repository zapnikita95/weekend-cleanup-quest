# Weekend Cleanup Quest

Пиксельная браузерная мини-игра для уборки по выходным вдвоём.

## Что есть

- Два игрока с именами и пиксельными CSS-аватарками.
- Общая библиотека дел: название, примерное время, сложность, включение в текущий раунд.
- Рандомное распределение выбранных дел так, чтобы сумма времени на каждого игрока не превышала лимит раунда.
- Экран уборки: слева первый игрок, справа второй, Space закрывает следующее дело первого, Enter закрывает следующее дело второго.
- Клик мышкой по делу тоже отмечает его выполненным.
- Очки за выполненные дела, минуты, сложность, скорость, серию выполнений и оценку партнёра.
- Простая chiptune-музыка через Web Audio API, без внешних аудиофайлов.
- Сохранение игроков и библиотеки дел в localStorage.

## Локально

```bash
npm install
npm run dev
```

## Production / Railway

```bash
npm run build
npm start
```

Railway может использовать стандартные команды:

- Build command: `npm run build`
- Start command: `npm start`
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
