import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { REPORTS_DIR } from './paths.js';

const SUMMARY_HEADINGS = ['SUMMARY', 'КРАТКОЕ'];

function mdEscapeLinkLabel(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function buildDocx(title, analysisText, pages, date, lang) {
  const isRu = lang === 'ru';
  const lines = analysisText.split('\n');
  const children = [];

  children.push(new Paragraph({
    text: title,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `${isRu ? 'Дата отчёта' : 'Report date'}: ${date}`, italics: true, color: '666666' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: isRu ? 'Источники:' : 'Sources:', bold: true })],
    spacing: { after: 100 },
  }));
  pages.forEach(p => children.push(new Paragraph({
    children: [new TextRun({ text: `• ${p.title}`, color: '0563C1' })],
    spacing: { after: 80 },
  })));
  children.push(new Paragraph({ text: '', spacing: { after: 300 } }));

  for (const line of lines) {
    if (line.startsWith('---')) {
      children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    } else if (line.startsWith('## ')) {
      const headingText = line.replace('## ', '');
      const isSummary = SUMMARY_HEADINGS.some(s => headingText.startsWith(s));
      children.push(new Paragraph({
        text: headingText,
        heading: isSummary ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.replace(/^[-•]\s+/, '') })],
        bullet: { level: 0 },
        spacing: { after: 80 },
      }));
    } else if (line.trim().length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line })],
        spacing: { after: 120 },
      }));
    }
  }

  return new Document({
    sections: [{ properties: {}, children }],
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
  });
}

function buildMarkdown(title, analysisText, pages, date, lang) {
  const isRu = lang === 'ru';
  const src = pages.map(p => `- [${mdEscapeLinkLabel(p.title)}](${p.url})`).join('\n');
  return [
    `# ${title}`,
    '',
    `*${isRu ? 'Дата отчёта' : 'Report date'}: ${date}*`,
    '',
    `## ${isRu ? 'Источники' : 'Sources'}`,
    '',
    src,
    '',
    '---',
    '',
    analysisText.trim(),
    '',
  ].join('\n');
}

export async function saveReports(title, analysisText, pages, lang = 'ru') {
  const isRu = lang === 'ru';
  const date = new Date().toLocaleDateString(isRu ? 'ru-RU' : 'en-US');
  const safeName = title.replace(/[^a-zA-Zа-яА-Я0-9 _-]/g, '').trim().slice(0, 50);
  const base = `report_${safeName}_${Date.now()}`;

  mkdirSync(REPORTS_DIR, { recursive: true });
  const docxPath = path.join(REPORTS_DIR, `${base}.docx`);
  const mdPath = path.join(REPORTS_DIR, `${base}.md`);

  const spinner = ora(`${isRu ? 'Собираю' : 'Building'} .md + .docx...`).start();

  writeFileSync(docxPath, await Packer.toBuffer(buildDocx(title, analysisText, pages, date, lang)));
  writeFileSync(mdPath, buildMarkdown(title, analysisText, pages, date, lang), 'utf8');

  spinner.succeed(chalk.green(`${isRu ? 'Готово' : 'Done'}: ${path.basename(mdPath)} + ${path.basename(docxPath)}`));
  console.log(chalk.white(`  ${mdPath}`));
  console.log(chalk.white(`  ${docxPath}`));

  try { execSync(`open "${mdPath}"`); execSync(`open "${docxPath}"`); } catch {}

  return { docxPath, mdPath };
}
