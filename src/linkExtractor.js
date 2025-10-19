export async function extractLinks(page, siteConfig, currentUrl) {
  const additionalExcludes = siteConfig.excludeLinks || [];
  
  const links = await page.evaluate((excludes) => {
    const foundLinks = [];
    const processedHrefs = new Set();
    const currentDomain = window.location.hostname;
    
    // ONLY extract from main navigation areas - be very selective
    const navContainers = Array.from(document.querySelectorAll(
      'nav, [role="navigation"], aside[class*="sidebar"], [class*="Sidebar"], header nav'
    ));
    
    // Also look for main content links (like cards on landing pages)
    const mainContent = document.querySelector('main, article, [role="main"]');
    
    navContainers.forEach(nav => {
      const navLinks = Array.from(nav.querySelectorAll('a[href]'));
      navLinks.forEach(a => {
        if (a.href && a.innerText.trim()) {
          const linkText = a.innerText.trim().toLowerCase();
          
          // Skip footer-type links TODO: Maybe just make it ignore anything contained in footer element? This works for the sites I tested with but could probably be made more universal TBH
          if (
            linkText.includes('built with') ||
            linkText.includes('powered by') ||
            linkText.startsWith('©') ||
            linkText.includes('privacy') ||
            linkText.includes('terms') ||
            linkText.length <= 2
          ) {
            return;
          }
          
          foundLinks.push({
            text: a.innerText.trim(),
            href: a.href,
            type: 'nav'
          });
          processedHrefs.add(a.href);
        }
      });
    });
    
    // Extract primary content links from main area (for landing pages)
    if (mainContent) {
      const contentLinks = Array.from(mainContent.querySelectorAll('a[href]'));
      contentLinks.forEach(a => {
        if (!processedHrefs.has(a.href) && a.innerText.trim()) {
          const linkText = a.innerText.trim().toLowerCase();
          
          // Skip footer-type links and very short links TODO: think about refatoring to ignore all FOOTER content to make more universal
          if (
            linkText.includes('built with') ||
            linkText.includes('powered by') ||
            linkText.startsWith('©') ||
            linkText.includes('privacy') ||
            linkText.includes('terms') ||
            linkText.length <= 2
          ) {
            return;
          }
          
          // Only add if the link seems substantial (likely a section/page link)
          if (linkText.length > 5) {
            foundLinks.push({
              text: a.innerText.trim(),
              href: a.href,
              type: 'content'
            });
            processedHrefs.add(a.href);
          }
        }
      });
    }
    
    // Filter and deduplicate
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    foundLinks.forEach(link => {
      if (!link.text || link.text.length === 0 || link.text.length > 200) return;
      if (!link.href || link.href.includes('#')) return;
      
      // Check same domain
      try {
        const linkUrl = new URL(link.href);
        if (linkUrl.hostname !== currentDomain) return;
      } catch (e) {
        return;
      }
      
      for (const exclude of excludes) {
        if (link.href.includes(exclude)) return;
      }
      
      // Deduplicate by URL
      if (!seenUrls.has(link.href)) {
        seenUrls.add(link.href);
        uniqueLinks.push(link);
      }
    });
    
    return uniqueLinks.slice(0, 20);
  }, additionalExcludes);

  return links;
}

export function filterLinks(links, currentUrl) {
  const currentUrlObj = new URL(currentUrl);
  const siteDomain = currentUrlObj.hostname;

  const filteredLinks = links.filter(link => {
    try {
      const linkUrl = new URL(link.href);
      const pageUrlObj = new URL(currentUrl);
      
      // Filter out off-site links
      if (linkUrl.hostname !== siteDomain) {
        return false;
      }
      
      linkUrl.hash = '';
      pageUrlObj.hash = '';
      
      const linkPath = linkUrl.origin + linkUrl.pathname.replace(/\/$/, '');
      const currentPath = pageUrlObj.origin + pageUrlObj.pathname.replace(/\/$/, '');
      
      return linkPath !== currentPath;
    } catch (e) {
      return true;
    }
  });

  return {
    filteredLinks,
    removedCount: links.length - filteredLinks.length
  };
}