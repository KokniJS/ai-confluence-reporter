import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

const MEETING_NOTES_TITLE_RE = /meeting\s*notes/i;
const MEETING_NOTES_URL_RE = /meeting[\s_+-]*notes|blueprint\/meeting/i;
const PAGE_TEXT_MAX = 12000;
const SCRAPE_CONCURRENCY = 4;

function isMeetingNotesPage(title, url) {
  return MEETING_NOTES_TITLE_RE.test(title || '') || MEETING_NOTES_URL_RE.test(url || '');
}

function filterMeetingNotes(tree) {
  const skip = new Set();
  for (let i = 0; i < tree.length; i++) {
    if (!isMeetingNotesPage(tree[i].title, tree[i].url)) continue;
    const d = tree[i].depth;
    skip.add(i);
    for (let j = i + 1; j < tree.length && tree[j].depth > d; j++) skip.add(j);
  }
  return tree.filter((_, i) => !skip.has(i));
}

function extractPageText() {
  const noiseSelectors = [
    'script', 'style', 'nav', 'header', 'footer',
    '[data-testid="page-tree-container"]',
    '[data-vc="space-navigation"]',
    '[data-vc="Nav4-space-header"]',
    '[data-testid="app-navigation-space-container"]',
    '.aui-nav', '#footer', '.page-navigation',
    '.page-metadata-modification-info',
  ];

  function cleanAndText(el) {
    const clone = el.cloneNode(true);
    noiseSelectors.forEach(sel => clone.querySelectorAll(sel).forEach(n => n.remove()));
    return clone.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }

  const akRenderer = document.querySelector('.ak-renderer-document');
  if (akRenderer) return cleanAndText(akRenderer);

  const rendererRoot = document.querySelector('[data-renderer-start-pos]');
  if (rendererRoot) return cleanAndText(rendererRoot.parentElement ?? rendererRoot);

  const classic = document.querySelector('#main-content, .wiki-content, .content-body, [data-testid="content-body"]');
  if (classic) return cleanAndText(classic);

  const jira = document.querySelector('#issue-content, .issue-view-layout');
  if (jira) return cleanAndText(jira);

  return cleanAndText(document.body);
}

async function extractPageTree(page) {
  return page.evaluate(() => {
    function dedupeByUrl(items) {
      const seen = new Set();
      return items.filter(i => {
        if (!i.url || seen.has(i.url)) return false;
        seen.add(i.url);
        return true;
      });
    }

    function indentPxFromStyle(el) {
      if (!el) return null;
      const m = (el.getAttribute('style') || '').match(/--[a-z0-9_]+:\s*([\d.]+)px/);
      return m ? parseFloat(m[1]) : null;
    }

    function paddingLeftPx(el) {
      if (!el) return null;
      const m = (el.getAttribute('style') || '').match(/padding-left:\s*([\d.]+)px/i);
      return m ? parseFloat(m[1]) : null;
    }

    function indentFromAncestors(el, stopEl) {
      let x = el;
      while (x && x !== stopEl && x !== document.body) {
        const v = indentPxFromStyle(x) ?? paddingLeftPx(x);
        if (v !== null) return v;
        x = x.parentElement;
      }
      return null;
    }

    function titleFromAnchor(a) {
      const span = a.querySelector('.title span, [class*="title"] span, [data-testid="search-page-tree-item-title"]');
      return (span?.textContent || '').trim() || (a.querySelector('span')?.textContent || '').trim() || a.textContent.trim();
    }

    function depthFromDataVc(anchor, root) {
      let d = 0;
      let el = anchor.parentElement;
      while (el && el !== root) {
        if (el.hasAttribute?.('data-vc') && el.getAttribute('data-vc') !== 'content-tree-search') d++;
        el = el.parentElement;
      }
      return Math.max(0, d - 1);
    }

    function depthFromUl(anchor, root) {
      let depth = 0;
      let el = anchor.parentElement;
      while (el && el !== root && el !== document.body) {
        if (el.tagName === 'UL') depth++;
        el = el.parentElement;
      }
      return Math.max(0, depth - 1);
    }

    function rankDepths(items, getIndent) {
      const indents = items.map(r => getIndent(r) ?? 0);
      const uniqueSorted = [...new Set(indents)].sort((a, b) => a - b);
      const depthOf = new Map(uniqueSorted.map((v, i) => [v, i]));
      return items.map((r, idx) => ({ ...r, depth: depthOf.get(indents[idx]) ?? 0 }));
    }

    const searchRoot = document.querySelector('[data-vc="content-tree-search"]');
    if (searchRoot) {
      const rows = Array.from(searchRoot.querySelectorAll('[class*="hover-preloader-page-tree-item"]'));
      if (rows.length > 0) {
        const raw = rows.flatMap(row => {
          const a = row.querySelector('a[data-testid="page-tree-item"]') ||
            row.querySelector('a[href*="/wiki/"], a[href*="/spaces/"], a[href*="/display/"], a[href]');
          if (!a?.href) return [];
          const titleSpan = row.querySelector('.title span, [class*="title"] span, [data-testid="search-page-tree-item-title"]');
          const title = (titleSpan?.textContent || '').trim() || titleFromAnchor(a);
          if (!title) return [];
          const indentPx = indentFromAncestors(a, row) ?? indentFromAncestors(row, searchRoot);
          return [{ title, url: a.href, indentPx, a }];
        });
        if (raw.length > 0) {
          const items = raw.some(r => r.indentPx !== null)
            ? rankDepths(raw, r => r.indentPx)
            : (() => {
                const byUl = raw.map(r => ({ ...r, depth: depthFromUl(r.a, searchRoot) }));
                return byUl.every(i => i.depth === 0)
                  ? raw.map(r => ({ ...r, depth: depthFromDataVc(r.a, searchRoot) }))
                  : byUl;
              })();
          const deduped = dedupeByUrl(items);
          if (deduped.length > 0) return deduped;
        }
      }

      const linksInSearch = Array.from(searchRoot.querySelectorAll('a[data-testid="page-tree-item"]'));
      if (linksInSearch.length > 0) {
        const rawIndents = linksInSearch.map(a => {
          const row = a.closest('[class*="hover-preloader-page-tree-item"]');
          return (row ? indentFromAncestors(a, row) : null) ?? indentFromAncestors(a, searchRoot);
        });
        if (rawIndents.some(v => v !== null)) {
          const indents = rawIndents.map(v => v ?? 0);
          const uniqueSorted = [...new Set(indents)].sort((a, b) => a - b);
          const depthOf = new Map(uniqueSorted.map((v, i) => [v, i]));
          const items = linksInSearch
            .map((a, idx) => ({ title: titleFromAnchor(a), url: a.href, depth: depthOf.get(indents[idx]) ?? 0 }))
            .filter(i => i.title && i.url);
          if (items.length > 0) return dedupeByUrl(items);
        }
        const items = linksInSearch
          .map(a => ({ title: titleFromAnchor(a), url: a.href, depth: depthFromUl(a, searchRoot) || depthFromDataVc(a, searchRoot) }))
          .filter(i => i.title && i.url);
        if (items.length > 0) return dedupeByUrl(items);
      }
    }

    const links = Array.from(document.querySelectorAll('a[data-testid="page-tree-item"]'));
    if (links.length === 0) {
      return Array.from(document.querySelectorAll('.children-show-hide a, .child-title a, #children-section a'))
        .map(a => ({ title: a.textContent.trim(), url: a.href, depth: 0 }))
        .filter(i => i.title && i.url);
    }

    const rawIndents = links.map(a => {
      const m = (a.getAttribute('style') || '').match(/--[a-z0-9_]+:\s*([\d.]+)px/);
      return m ? parseFloat(m[1]) : null;
    });

    if (rawIndents.some(v => v !== null)) {
      const indents = rawIndents.map(v => v ?? 0);
      const uniqueSorted = [...new Set(indents)].sort((a, b) => a - b);
      const depthOf = new Map(uniqueSorted.map((v, i) => [v, i]));
      return links.map((a, idx) => {
        const span = a.querySelector('.title span, [class*="title"] span');
        return { title: (span?.textContent || '').trim() || a.textContent.trim(), url: a.href, depth: depthOf.get(indents[idx]) ?? 0 };
      }).filter(i => i.title && i.url);
    }

    const container = document.querySelector('#page-tree-container, [data-testid="page-tree-container"]');
    return links.map(a => {
      const span = a.querySelector('.title span, [class*="title"] span');
      const title = (span?.textContent || '').trim() || a.textContent.trim();
      let depth = 0;
      let el = a.parentElement;
      while (el && el !== container && el !== document.body) {
        if (el.tagName === 'UL') depth++;
        el = el.parentElement;
      }
      return { title, url: a.href, depth: Math.max(0, depth - 1) };
    }).filter(i => i.title && i.url);
  });
}

async function expandSidebarTree(page) {
  const maxPasses = 45;
  let prevCount = -1;
  for (let pass = 0; pass < maxPasses; pass++) {
    const count = await page.evaluate(() => {
      const pt = document.querySelectorAll('a[data-testid="page-tree-item"]').length;
      const search = document.querySelector('[data-vc="content-tree-search"]');
      return pt + (search ? search.querySelectorAll('[class*="hover-preloader-page-tree-item"]').length : 0);
    });
    if (count === prevCount && pass > 2) break;
    prevCount = count;
    await page.evaluate(() => {
      const boxes = [
        document.querySelector('[data-testid="page-tree-container"]'),
        document.querySelector('#page-tree-container'),
        document.querySelector('[data-vc="content-tree-search"]'),
      ].filter(Boolean);
      for (const box of boxes) {
        box.querySelectorAll('button[aria-expanded="false"]').forEach(b => { try { b.click(); } catch {} });
        box.scrollTop = box.scrollHeight;
        box.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 320));
  }
}

async function scrapePages(rootPage, rootTitle, rootUrl, rootContent, toScrape) {
  const pages = [{ title: rootTitle, url: rootUrl, content: rootContent, depth: 0 }];
  if (toScrape.length === 0) return pages;

  const browser = rootPage.browser();
  const ordered = toScrape.map((p, order) => ({ ...p, order }));
  const n = Math.min(SCRAPE_CONCURRENCY, ordered.length);
  const chunks = Array.from({ length: n }, () => []);
  ordered.forEach((p, i) => chunks[i % n].push(p));

  const spinner = ora(`Reading ${toScrape.length} pages (${n} parallel)...`).start();

  const scrapeChunk = async chunk => {
    const tab = await browser.newPage();
    await tab.setDefaultNavigationTimeout(45000);
    const out = [];
    try {
      for (const p of chunk) {
        if (isMeetingNotesPage(p.title, p.url)) continue;
        spinner.text = `Reading: ${p.title}`;
        try {
          await tab.goto(p.url, { waitUntil: 'networkidle2' });
          await new Promise(r => setTimeout(r, 450));
          const text = await tab.evaluate(extractPageText);
          const title = await tab.title();
          if (text.trim().length > 100) {
            out.push({ title, url: p.url, content: text.trim().slice(0, PAGE_TEXT_MAX), depth: p.depth, order: p.order });
          }
        } catch {}
      }
    } finally {
      await tab.close();
    }
    return out;
  };

  const parts = await Promise.all(chunks.map(scrapeChunk));
  const scraped = parts.flat().sort((a, b) => a.order - b.order);
  for (const row of scraped) {
    delete row.order;
    pages.push(row);
  }

  spinner.succeed(chalk.green(`Read ${pages.length} pages`));
  return pages;
}

export async function selectAndScrapePages(rootPage) {
  const rootUrl = rootPage.url();
  const rootContent = (await rootPage.evaluate(extractPageText)).trim().slice(0, PAGE_TEXT_MAX);
  const rootTitle = await rootPage.title();

  const spinnerExpand = ora('Expanding page tree...').start();
  await expandSidebarTree(rootPage);
  spinnerExpand.succeed(chalk.green('Tree expanded'));

  const spinnerTree = ora('Reading page tree...').start();
  let tree = filterMeetingNotes(await extractPageTree(rootPage));
  spinnerTree.stop();

  if (tree.length === 0) {
    console.log(chalk.dim('  No subpages found — analyzing current page only.'));
    return [{ title: rootTitle, url: rootUrl, content: rootContent, depth: 0 }];
  }

  console.log(chalk.dim('\n  Page tree:'));
  tree.forEach(p => {
    const indent = '  '.repeat(p.depth);
    const marker = p.depth === 0 ? chalk.bold('◆') : chalk.dim('◇');
    console.log(chalk.dim(`    ${indent}${marker} [${p.depth}] ${p.title}`));
  });
  console.log();

  const parents = tree.filter(p => p.depth === 0);
  console.log(chalk.bold(`Pages in sidebar: ${tree.length}  |  Top level: ${parents.length}`));

  if (parents.length === 0) {
    console.log(chalk.yellow('  Could not determine parent pages — analyzing all.'));
    return scrapePages(rootPage, rootTitle, rootUrl, rootContent, tree.filter(p => p.url !== rootUrl));
  }

  const { approved } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'approved',
    message: 'Select sections [SPACE = toggle, ENTER = confirm]:',
    choices: parents.map(p => ({ name: p.title, value: p.url, checked: false })),
    validate: v => v.length > 0 ? true : 'Select at least one page',
  }]);

  const approvedSet = new Set(approved);
  const toScrape = tree.filter(p => {
    if (isMeetingNotesPage(p.title, p.url)) return false;
    if (p.depth === 0) return approvedSet.has(p.url);
    const idx = tree.indexOf(p);
    for (let i = idx - 1; i >= 0; i--) {
      if (tree[i].depth === 0) return approvedSet.has(tree[i].url);
    }
    return false;
  }).filter(p => p.url !== rootUrl);

  console.log(chalk.dim(`  Pages to read: ${toScrape.length}`));
  return scrapePages(rootPage, rootTitle, rootUrl, rootContent, toScrape);
}
