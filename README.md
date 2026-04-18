# AI Confluence Reporter

> 🇬🇧 [English](#english) | 🇷🇺 [Русский](#русский)

---

## English

A CLI tool for automated analysis of Confluence and Jira pages using Claude AI. It scrapes the page tree, analyzes content, and generates structured reports in `.md` and `.docx` formats.

### Requirements

- Node.js 18+
- Chrome/Chromium browser with [remote debugging](#launching-browser-with-remote-debugging) enabled
- [Anthropic Claude](https://console.anthropic.com/) API key

### Installation

**Globally (recommended):**
```bash
npm install -g super-research-ai-agent
```

**From source:**
```bash
git clone https://github.com/KokniJS/ai-confluence-reporter.git
cd ai-confluence-reporter
npm install
npm install -g .
```

### Launching browser with remote debugging

The tool connects to an already running browser via WebSocket. Launch Chrome with the `--remote-debugging-port` flag:

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

**Windows:**
```cmd
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\tmp\chrome-debug
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

After launching, open `http://localhost:9222/json/version` and copy the `webSocketDebuggerUrl`:
```
ws://127.0.0.1:9222/devtools/browser/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Usage

```bash
research-agent
```

On first run the agent will ask for:
1. **Browser WebSocket URL** — the address from the step above
2. **Claude API key** — from [console.anthropic.com](https://console.anthropic.com/)

Credentials are saved to `~/.super-research-agent.json` — no need to re-enter on subsequent runs.

### How it works

1. Agent lists all open browser tabs
2. Select the Confluence/Jira tab
3. Agent expands the full page tree in the sidebar
4. Select sections to analyze (space to check, Enter to confirm)
5. Agent reads all selected pages in parallel
6. Claude analyzes the content and generates a report
7. Report is saved to the `reports/` folder as `.md` and `.docx`

### Report structure

- **Description** — project/task overview
- **Key details** — concrete facts from the pages
- **Status and next steps**
- **Team and access**
- **List of analyzed pages**
- **Summary (EN)**

### Reset saved credentials

```bash
rm ~/.super-research-agent.json
```

---

## Русский

CLI-инструмент для автоматического анализа страниц Confluence и Jira с помощью Claude AI. Скрапит дерево страниц, анализирует содержимое и генерирует структурированные отчёты в форматах `.md` и `.docx`.

### Требования

- Node.js 18+
- Браузер Chrome/Chromium с включённым [remote debugging](#запуск-браузера-с-remote-debugging)
- API-ключ [Anthropic Claude](https://console.anthropic.com/)

### Установка

**Глобально (рекомендуется):**
```bash
npm install -g super-research-ai-agent
```

**Из исходников:**
```bash
git clone https://github.com/KokniJS/ai-confluence-reporter.git
cd ai-confluence-reporter
npm install
npm install -g .
```

### Запуск браузера с remote debugging

Инструмент подключается к уже открытому браузеру через WebSocket. Запусти Chrome с флагом `--remote-debugging-port`:

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

**Windows:**
```cmd
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\tmp\chrome-debug
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

После запуска открой `http://localhost:9222/json/version` и скопируй `webSocketDebuggerUrl`:
```
ws://127.0.0.1:9222/devtools/browser/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Использование

```bash
research-agent
```

При первом запуске агент попросит:
1. **Browser WebSocket URL** — адрес из шага выше
2. **Claude API key** — ключ из [console.anthropic.com](https://console.anthropic.com/)

Учётные данные сохраняются в `~/.super-research-agent.json` — при следующих запусках вводить не нужно.

### Процесс работы

1. Агент показывает список открытых вкладок браузера
2. Выбери вкладку с Confluence/Jira
3. Агент раскрывает дерево страниц в сайдбаре
4. Выбери нужные разделы (пробел — отметить, Enter — подтвердить)
5. Агент читает все страницы параллельно
6. Claude анализирует данные и генерирует отчёт
7. Отчёт сохраняется в папку `reports/` в форматах `.md` и `.docx`

### Структура отчёта

- **Описание** — суть проекта/задачи
- **Ключевые детали** — конкретные факты
- **Статус и следующие шаги**
- **Команда и доступы**
- **Список проанализированных страниц**
- **Summary (EN)** — краткий перевод на английский

### Сброс сохранённых данных

```bash
rm ~/.super-research-agent.json
```

---

## License

ISC
