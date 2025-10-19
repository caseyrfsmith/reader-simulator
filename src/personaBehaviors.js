function extractKeywords(goal) {
  const stopWords = ['how', 'to', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'for', 'my', 'i', 'you', 'with', 'from', 'by', 'about', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once'];
  
  return goal
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.includes(word));
}

export const personaBehaviors = {
  'efficient-developer': {
    selectLink(links, goal) {
      const scored = links.map(link => {
        const text = link.text.toLowerCase();
        let score = 0;
        
        // HEAVILY favor reference/API docs
        if (text.includes('api reference')) score += 100;
        if (text === 'api reference') score += 50; // Exact match bonus
        if (text.includes('reference')) score += 40;
        if (text.includes('api')) score += 30;
        if (text.includes('documentation')) score += 25;
        if (text.includes('getting started')) score += 20;
        
        // Look for goal keywords
        const goalKeywords = extractKeywords(goal);
        goalKeywords.forEach(keyword => {
          if (text.includes(keyword)) score += 35;
        });
        
        // HEAVY PENALTY for guides/tutorials
        if (text.includes('guide') && !text.includes('api')) score -= 30;
        if (text.includes('tutorial')) score -= 30;
        if (text.includes('overview') && !text.includes('api')) score -= 20;
        
        return { ...link, score };
      });
      
      return scored.sort((a, b) => b.score - a.score);
    },
    
    contentStrategy: {
      mode: 'keyword-search',  // NEW MODE
      initialChars: 5000,  // Load LOTS of content
      fullChars: 5000,     // Always max
      loadFullOn: []       // Never progressive, always full
    },
    
    successCriteria: [
      "API endpoint or URL format",
      "Code example showing exact syntax",
      "Request/response format or headers",
      "Authentication header or API key format",
      "Parameter reference table"
    ],
    
    // Ctrl+F simulation - extract LARGE sections around keywords
    async extractTargetedContent(page, goal, fullContent) {
      const keywords = extractKeywords(goal);
      
      if (keywords.length === 0) {
        return fullContent; // Return everything if no keywords
      }
      
      // Extract LARGE context windows (like reading multiple paragraphs)
      const targeted = await page.evaluate((keywords) => {
        const text = document.body.innerText;
        const sections = [];
        
        keywords.forEach(keyword => {
          // HUGE context window - 1000 chars each side (like Ctrl+F + reading surrounding content)
          const regex = new RegExp(`.{0,1000}${keyword}.{0,1000}`, 'gi');
          const matches = text.match(regex);
          if (matches) {
            sections.push(...matches.map(m => m.trim()));
          }
        });
        
        if (sections.length > 0) {
          return sections.join('\n\n---\n\n');
        }
        
        return null;
      }, keywords);
      
      // If keyword search found content, use it; otherwise use full content
      return targeted || fullContent;
    }
  },
  
  'confused-beginner': {
    selectLink(links, goal) {
      const scored = links.map(link => {
        const text = link.text.toLowerCase();
        let score = 0;
        
        // Heavily favor tutorials and guides
        if (text.includes('getting started')) score += 50;
        if (text.includes('tutorial')) score += 45;
        if (text.includes('quickstart')) score += 45;
        if (text.includes('guide')) score += 40;
        if (text.includes('beginner')) score += 40;
        if (text.includes('intro')) score += 35;
        if (text.includes('example')) score += 30;
        if (text.includes('how to')) score += 30;
        
        // Look for goal keywords
        const goalKeywords = extractKeywords(goal);
        goalKeywords.forEach(keyword => {
          if (text.includes(keyword)) score += 25;
        });
        
        // PENALTY for reference docs because confused beginners need context, not references
        if (text.includes('reference') && !text.includes('guide')) score -= 20;
        if (text.includes('api') && !text.includes('guide') && !text.includes('tutorial')) score -= 15;
        
        return { ...link, score };
      });
      
      return scored.sort((a, b) => b.score - a.score);
    },
    
    contentStrategy: {
      mode: 'progressive',
      initialChars: 1500,
      fullChars: 5000,
      loadFullOn: ['low', 'medium']
    },
    
    successCriteria: [
      "Step-by-step tutorial or walkthrough",
      "Working code example to copy and paste",
      "Explanation of what each part does",
      "Prerequisites, setup instructions, or 'before you begin' section"
    ],
    
    async extractTargetedContent(page, goal, fullContent) {
      return fullContent; // Beginners need all context
    }
  },
  
  'methodical-learner': {
    selectLink(links, goal) {
      // Don't reorder - respect document structure
      return links;
    },
    
    contentStrategy: {
      mode: 'full-always',
      initialChars: 5000,
      fullChars: 5000,
      loadFullOn: []
    },
    
    successCriteria: [
      "Complete explanation with context and background",
      "Prerequisites and dependencies clearly listed",
      "Multiple related sections that build on each other",
      "Comprehensive examples with explanations"
    ],
    
    async extractTargetedContent(page, goal, fullContent) {
      return fullContent;
    }
  },
  
  'casual-browser': {
    selectLink(links, goal) {
      const scored = links.map(link => {
        const text = link.text.toLowerCase();
        let score = 0;
        
        // Moderate preferences - balanced scoring
        if (text.includes('getting started')) score += 20;
        if (text.includes('guide')) score += 15;
        if (text.includes('api')) score += 15;
        if (text.includes('reference')) score += 15;
        if (text.includes('documentation')) score += 10;
        
        // Look for goal keywords with moderate weight
        const goalKeywords = extractKeywords(goal);
        goalKeywords.forEach(keyword => {
          if (text.includes(keyword)) score += 20;
        });
        
        return { ...link, score };
      });
      
      return scored.sort((a, b) => b.score - a.score);
    },
    
    contentStrategy: {
      mode: 'progressive',
      initialChars: 2000,
      fullChars: 4000,
      loadFullOn: ['low']
    },
    
    successCriteria: [
      "Clear explanation or code example",
      "Relevant technical information",
      "Either tutorial-style or reference-style content is acceptable"
    ],
    
    async extractTargetedContent(page, goal, fullContent) {
      const keywords = extractKeywords(goal);
      
      if (keywords.length === 0) {
        return fullContent.substring(0, 4000);
      }
      
      // Moderate context window
      const targeted = await page.evaluate((keywords) => {
        const text = document.body.innerText;
        const sections = [];
        
        keywords.forEach(keyword => {
          const regex = new RegExp(`.{0,400}${keyword}.{0,400}`, 'gi');
          const matches = text.match(regex);
          if (matches) {
            sections.push(...matches.map(m => m.trim()));
          }
        });
        
        return sections.length > 0 ? sections.join('\n\n---\n\n') : null;
      }, keywords);
      
      return targeted || fullContent.substring(0, 4000);
    }
  },
  
  // TODO: IDK if this is a useful persona or not since debugging behavior is heavily search-based. come back to this.
  'desperate-debugger': {
    selectLink(links, goal) {
      const scored = links.map(link => {
        const text = link.text.toLowerCase();
        let score = 0;
        
        // HEAVILY favor troubleshooting content
        if (text.includes('troubleshoot')) score += 60;
        if (text.includes('error')) score += 55;
        if (text.includes('debug')) score += 50;
        if (text.includes('common issues')) score += 50;
        if (text.includes('faq')) score += 45;
        if (text.includes('fix')) score += 40;
        if (text.includes('problem')) score += 35;
        
        // Look for goal keywords (might include error codes)
        const goalKeywords = extractKeywords(goal);
        goalKeywords.forEach(keyword => {
          if (text.includes(keyword)) score += 50;
        });
        
        return { ...link, score };
      });
      
      return scored.sort((a, b) => b.score - a.score);
    },
    
    contentStrategy: {
      mode: 'keyword-search',
      initialChars: 3000,
      fullChars: 3000,
      loadFullOn: []
    },
    
    successCriteria: [
      "Error code explanation or error message match",
      "Troubleshooting steps or checklist",
      "Quick fix or workaround",
      "Common problems section"
    ],
    
    async extractTargetedContent(page, goal, fullContent) {
      const keywords = extractKeywords(goal);
      keywords.push('error', 'fix', 'solution', 'troubleshoot', 'resolve', 'issue', 'problem');
      
      const targeted = await page.evaluate((keywords) => {
        const text = document.body.innerText;
        const sections = [];
        
        keywords.forEach(keyword => {
          const regex = new RegExp(`.{0,600}${keyword}.{0,600}`, 'gi');
          const matches = text.match(regex);
          if (matches) {
            sections.push(...matches.map(m => m.trim()));
          }
        });
        
        return sections.length > 0 ? sections.join('\n\n---\n\n') : null;
      }, keywords);
      
      return targeted || fullContent;
    }
  }
};

export function getPersonaBehavior(personaKey) {
  return personaBehaviors[personaKey] || personaBehaviors['casual-browser'];
}