#!/usr/bin/env node
import puppeteer from 'puppeteer-core';
import Anthropic from '@anthropic-ai/sdk';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

import { loadConfig, saveConfig } from './src/config.js';
import { selectAndScrapePages } from './src/scraper.js';
import { analyzeWithClaude } from './src/analyzer.js';
import { saveReports } from './src/reports.js';

async function analyzeTab(browser, client) {
  const spinnerTabs = ora('Fetching open tabs...').start();
  let tabs;
  try {
    const pages = await browser.pages();
    tabs = (await Promise.all(pages.map(async p => ({ url: p.url(), title: await p.title(), _page: p }))))
      .filter(t => t.url.startsWith('http'));
    spinnerTabs.succeed(chalk.green(`Found ${tabs.length} open tab(s)`));
  } catch (err) {
    spinnerTabs.fail(chalk.red(err.message));
    return;
  }

  if (tabs.length === 0) {
    console.log(chalk.red('No open page tabs found.'));
    return;
  }

  console.log(chalk.bold('\nOpen tabs:'));
  tabs.forEach((t, i) => {
    const url = t.url.length > 70 ? t.url.slice(0, 67) + '...' : t.url;
    console.log(chalk.gray(`  [${i + 1}]`) + ` ${chalk.white(t.title || '(no title)')} ${chalk.dim(url)}`);
  });

  const { tabIndex } = await inquirer.prompt([{
    type: 'input',
    name: 'tabIndex',
    message: chalk.cyan(`Tab number to analyze [1-${tabs.length}]:`),
    default: '1',
    validate: v => {
      const n = parseInt(v);
      return (n >= 1 && n <= tabs.length) ? true : `Enter 1–${tabs.length}`;
    },
  }]);

  const { lang } = await inquirer.prompt([{
    type: 'list',
    name: 'lang',
    message: chalk.cyan('Report language / Язык отчёта:'),
    choices: [
      { name: '🇬🇧  English', value: 'en' },
      { name: '🇷🇺  Русский', value: 'ru' },
    ],
  }]);

  const chosen = tabs[parseInt(tabIndex) - 1];
  let scrapedPages;
  try {
    scrapedPages = await selectAndScrapePages(chosen._page);
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    return;
  }

  const spinnerAI = ora('Analyzing with Claude...').start();
  let result;
  try {
    result = await analyzeWithClaude(client, scrapedPages, lang);
    spinnerAI.succeed(chalk.green('Analysis complete'));
  } catch (err) {
    spinnerAI.fail(chalk.red(`Claude error: ${err.message}`));
    return;
  }

  console.log(chalk.bold.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(result);
  console.log(chalk.bold.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  const { save } = await inquirer.prompt([{
    type: 'confirm',
    name: 'save',
    message: lang === 'ru'
      ? 'Сохранить отчёты (.md + .docx в папку reports/)?'
      : 'Save reports (.md + .docx to reports/ folder)?',
    default: true,
  }]);

  if (save) await saveReports(chosen.title || 'Report', result, scrapedPages, lang);
}

async function connectBrowser(wsUrl) {
  return puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });
}

async function main() {
  console.log(chalk.bold.magenta('\n⚡ Super Research AI Agent\n'));

  const saved = loadConfig();
  let { wsUrl, apiKey } = saved;

  if (wsUrl && apiKey) {
    console.log(chalk.dim('  Using saved credentials (~/.super-research-agent.json)'));
  }

  const questions = [];
  if (!wsUrl) questions.push({
    type: 'input',
    name: 'wsUrl',
    message: chalk.cyan('Browser WebSocket URL (Puppeteer):'),
    validate: v => v.startsWith('ws://') || v.startsWith('wss://') ? true : 'Must start with ws:// or wss://',
  });
  if (!apiKey) questions.push({
    type: 'password',
    name: 'apiKey',
    message: chalk.cyan('Claude API key:'),
    validate: v => v.length > 10 ? true : 'Enter a valid API key',
  });
  if (questions.length > 0) {
    const answers = await inquirer.prompt(questions);
    wsUrl = wsUrl || answers.wsUrl;
    apiKey = apiKey || answers.apiKey;
  }

  let browser;
  while (!browser) {
    const spinner = ora('Connecting to browser...').start();
    try {
      browser = await connectBrowser(wsUrl);
      spinner.succeed(chalk.green('Browser connected'));
      saveConfig({ wsUrl, apiKey });
    } catch (err) {
      spinner.fail(chalk.red(`Failed to connect: ${err.message}`));
      const { newWsUrl } = await inquirer.prompt([{
        type: 'input',
        name: 'newWsUrl',
        message: chalk.cyan('Browser WebSocket URL (Puppeteer):'),
        validate: v => v.startsWith('ws://') || v.startsWith('wss://') ? true : 'Must start with ws:// or wss://',
      }]);
      wsUrl = newWsUrl;
    }
  }

  const client = new Anthropic({ apiKey });

  let continueLoop = true;
  while (continueLoop) {
    await analyzeTab(browser, client);
    const { again } = await inquirer.prompt([{
      type: 'confirm',
      name: 'again',
      message: 'Analyze another tab?',
      default: false,
    }]);
    continueLoop = again;
  }

  await browser.disconnect();
  console.log(chalk.dim('Disconnected. Bye!'));
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:', err.message));
  process.exit(1);
});
