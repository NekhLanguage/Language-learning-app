import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import { readdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = readdirSync(__dirname)
  .filter(f => f.match(/^\d{2}-.*\.html$/))
  .sort();

const browser = await puppeteer.launch({ headless: 'new' });

for (const file of files) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
  const filePath = 'file:///' + path.join(__dirname, file).replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  // let animations settle
  await new Promise(r => setTimeout(r, 600));
  const outFile = path.join(__dirname, file.replace('.html', '.png'));
  await page.screenshot({ path: outFile, fullPage: true });
  console.log('saved:', outFile);
  await page.close();
}

await browser.close();
console.log('done');
