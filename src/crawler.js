// crawler.js
import { chromium } from 'playwright';

async function crawlDocs(startUrl, maxPages = 10) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const visited = new Set();
  const sitemap = [];
  
  async function crawl(url, depth = 0) {
    if (visited.has(url) || depth > 3) return;
    visited.add(url);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      
      const title = await page.title();
      const content = await page.textContent('body');
      const links = await page.$$eval('a', els => 
        els.map(a => ({ text: a.textContent, href: a.href }))
          .filter(link => link.href.includes('docs'))
      );
      
      sitemap.push({ 
        url, 
        title, 
        content: content.slice(0, 1000),
        links: links.slice(0, 10)
      });
      
      console.log(`Crawled: ${title}`);
      
      if (sitemap.length < maxPages) {
        for (const link of links.slice(0, 3)) {
          await crawl(link.href, depth + 1);
        }
      }
    } catch (error) {
      console.error(`Error crawling ${url}:`, error.message);
    }
  }
  
  await crawl(startUrl);
  await browser.close();
  
  return sitemap;
}

export { crawlDocs };