import { chromium } from 'playwright';

export async function inspectSite(url) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('⏳ Waiting for page to fully load...\n');
    await page.waitForTimeout(3000);
    
    const analysis = await page.evaluate(() => {
      // Find all potential content containers
      const candidates = [
        { selector: 'article#content', element: document.querySelector('article#content') },
        { selector: 'article[id]', element: document.querySelector('article[id]') },
        { selector: 'article', element: document.querySelector('article') },
        { selector: 'main article', element: document.querySelector('main article') },
        { selector: 'main', element: document.querySelector('main') },
        { selector: '[role="main"]', element: document.querySelector('[role="main"]') },
        { selector: '.content', element: document.querySelector('.content') },
        { selector: '.docs-content', element: document.querySelector('.docs-content') },
        { selector: '.doc-content', element: document.querySelector('.doc-content') },
        { selector: '.documentation', element: document.querySelector('.documentation') },
        { selector: '.markdown-body', element: document.querySelector('.markdown-body') },
        { selector: '.Content-article', element: document.querySelector('.Content-article') },
        { selector: '.docs-body', element: document.querySelector('.docs-body') },
        { selector: '#content', element: document.querySelector('#content') }
      ];
      
      const bodyLength = document.body.innerText.length;
      
      const results = candidates
        .filter(c => c.element !== null)
        .map(c => {
          const textLength = c.element.innerText.length;
          return {
            selector: c.selector,
            textLength: textLength,
            bodyPercent: Math.round((textLength / bodyLength) * 100),
            tag: c.element.tagName,
            id: c.element.id || '',
            classes: c.element.className || '',
            preview: c.element.innerText.substring(0, 300).replace(/\n/g, ' ')
          };
        })
        .filter(r => r.textLength > 200 && r.bodyPercent >= 10 && r.bodyPercent <= 90)
        .sort((a, b) => b.textLength - a.textLength);
      
      return {
        url: window.location.href,
        domain: window.location.hostname,
        bodyLength: bodyLength,
        candidates: results
      };
    });
    
    await browser.close();
    
    return analysis;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export function formatInspectionReport(analysis) {
  let report = `📊 Analysis for ${analysis.domain}\n\n`;
  report += `Total body text: ${analysis.bodyLength} chars\n\n`;
  
  if (analysis.candidates.length === 0) {
    report += '⚠️  No suitable content containers found.\n';
    report += '💡 The page might be heavily JavaScript-rendered or use an uncommon structure.\n';
    report += '   Try running with browser visible (remove --headless) to debug.\n';
    return report;
  }
  
  report += 'Found content containers:\n\n';
  
  analysis.candidates.slice(0, 5).forEach((candidate, i) => {
    report += `${i + 1}. ${candidate.selector}\n`;
    report += `   📏 ${candidate.textLength} chars (${candidate.bodyPercent}% of page)\n`;
    report += `   🏷️  <${candidate.tag}>${candidate.id ? ` id="${candidate.id}"` : ''}${candidate.classes ? ` class="${candidate.classes.split(' ')[0]}..."` : ''}\n`;
    report += `   👀 "${candidate.preview.substring(0, 100)}..."\n\n`;
  });
  
  const best = analysis.candidates[0];
  report += '✅ Recommended configuration:\n\n';
  
  const config = {
    [analysis.domain]: {
      name: `${analysis.domain} Documentation`,
      contentSelector: best.selector,
      excludeLinks: []
    }
  };
  
  report += JSON.stringify(config, null, 2) + '\n\n';
  report += '💡 Add this to your sites.json file!\n';
  report += '   If sites.json doesn\'t exist, create it with:\n';
  report += '   { "_default": { "name": "Unknown Site", "contentSelector": null, "excludeLinks": [] } }\n';
  
  return report;
}