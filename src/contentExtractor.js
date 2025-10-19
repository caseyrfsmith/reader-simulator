export async function extractPageContent(page, siteConfig) {
  return await page.evaluate((config) => {
    let contentElement = null;
    let source = 'universal';
    
    // Try site-specific selector first
    if (config.contentSelector) {
      contentElement = document.querySelector(config.contentSelector);
      if (contentElement && contentElement.innerText.trim().length > 200) {
        source = config.contentSelector + ' (config)';
        const fullText = contentElement.innerText;
        
        // Extract headings from the content area
        const headings = Array.from(contentElement.querySelectorAll('h1, h2, h3, h4'))
          .map(h => h.textContent.trim())
          .filter(h => h.length > 0 && h.length < 200);
        
        return {
          title: document.title,
          headings: headings,
          contentPreview: fullText.substring(0, 1000),
          fullContent: fullText.substring(0, 5000),
          totalLength: fullText.length,
          url: window.location.href,
          contentSource: source,
          usingConfig: true
        };
      }
    }
    
    // Fall back to universal extraction
    const specificCandidates = [
      document.querySelector('article#content'),
      document.querySelector('article[id]'),
      document.querySelector('.Content-article article'),
      document.querySelector('.markdown-body'),
      document.querySelector('.doc-content'),
      document.querySelector('[class*="article"] article'),
      document.querySelector('[class*="content"] article')
    ].filter(el => el !== null);
    
    const broadCandidates = [
      document.querySelector('article'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('.content'),
      document.querySelector('.docs-content'),
      document.querySelector('.documentation'),
      document.querySelector('#content')
    ].filter(el => el !== null);
    
    const allCandidates = [...specificCandidates, ...broadCandidates];
    let bestCandidate = document.body;
    let maxLength = 0;
    const bodyLength = document.body.innerText.length;
    
    for (const candidate of allCandidates) {
      const text = candidate.innerText || '';
      const length = text.trim().length;
      
      if (length > 300 && 
          length > maxLength && 
          length < bodyLength * 0.9 &&
          length > bodyLength * 0.1) {
        maxLength = length;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate !== document.body) {
      source = bestCandidate.tagName;
      if (bestCandidate.id) source += '#' + bestCandidate.id;
      else if (bestCandidate.className) source += '.' + bestCandidate.className.split(' ')[0];
      source += ' (universal)';
    } else {
      source = 'BODY (fallback)';
    }

    const fullText = bestCandidate.innerText || '';
    
    // Extract all headings from the content area
    const headings = Array.from(bestCandidate.querySelectorAll('h1, h2, h3, h4'))
      .map(h => h.textContent.trim())
      .filter(h => h.length > 0 && h.length < 200);
    
    return {
      title: document.title,
      headings: headings,
      contentPreview: fullText.substring(0, 1000),
      fullContent: fullText.substring(0, 5000),
      totalLength: fullText.length,
      url: window.location.href,
      contentSource: source,
      usingConfig: false
    };
  }, siteConfig);
}