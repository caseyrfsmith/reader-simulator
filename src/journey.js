import { chromium } from 'playwright';
import { decideNextStep } from './decideNextStep.js';
import { extractPageContent } from './contentExtractor.js';
import { extractLinks, filterLinks } from './linkExtractor.js';
import { generateFeedbackReport, generateSuccessFeedback } from './feedbackGenerator.js';
import { Logger } from './logger.js';
import fs from 'fs/promises';
import { getPersonaBehavior } from './personaBehaviors.js';

export async function runJourney({
  startUrl,
  goal,
  persona,
  personaKey,
  maxSteps,
  showBrowser,
  outputDir,
  saveLog,
  apiKey
}) {
  // Load site configs
  let siteConfigs = {};
  try {
    const configData = await fs.readFile('/config/sites.json', 'utf-8');
    siteConfigs = JSON.parse(configData);
  } catch (e) {
    // No sites.json found, will use default extraction
  }
  
  const browser = await chromium.launch({ headless: !showBrowser });
  const page = await browser.newPage();
  const logger = new Logger(saveLog);
  
  // Get domain and site config
  const domain = new URL(startUrl).hostname;
  const siteConfig = siteConfigs[domain] || siteConfigs['_default'] || { 
    name: domain, 
    contentSelector: null, 
    excludeLinks: [] 
  };
  
  logger.log(`Site: ${siteConfig.name}`, '🌐');
  if (siteConfig.contentSelector) {
    logger.log(`Using custom selector: ${siteConfig.contentSelector}`, '⚙️');
  } else {
    logger.log('Using universal content extraction', '⚙️');
  }
  
  const journey = {
    persona: persona.name,
    personaKey: personaKey,
    goal: goal,
    startUrl: startUrl,
    siteConfig: siteConfig,
    steps: [],
    outcome: null,
    timestamp: new Date().toISOString(),
    visitedUrls: [],
    tokenStats: {
      totalContentCharsSent: 0,
      progressiveLoadCount: 0
    }
  };

  let currentStep = 0;

  try {
    logger.log('Loading initial page...', '⏳');
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    while (currentStep < maxSteps) {
      logger.log(`\nStep ${currentStep + 1}/${maxSteps}`, '📍');
      
      const currentUrl = await page.url();

      // GET PERSONA BEHAVIOR
      const behavior = getPersonaBehavior(personaKey);
      
      // Loop detection
      const urlCount = journey.visitedUrls.filter(u => u === currentUrl).length;
      if (urlCount >= 3) {
        logger.log('Visited this URL 3 times already - stuck in a loop!', '🔄');
        journey.outcome = 'loop-detected';
        break;
      }
      
      journey.visitedUrls.push(currentUrl);
      
      // Wait for content to load
      logger.log('Waiting for page content...', '⏳');
      await page.waitForTimeout(2000);
      
      // Extract page content
      const pageInfo = await extractPageContent(page, siteConfig);

      logger.log(`On: ${pageInfo.title}`, '📄');
      logger.log(`URL: ${pageInfo.url}`, '🔗');
      logger.log(`Content available: ${pageInfo.totalLength} chars`, '📊');
      logger.log(`Content source: ${pageInfo.contentSource}`, '🎯');
      if (pageInfo.headings && pageInfo.headings.length > 0) {
        logger.log(`Found ${pageInfo.headings.length} section headings`, '📑');
      }

      // Check if content is valid
      if (!pageInfo.contentPreview || pageInfo.contentPreview.trim().length < 50) {
        logger.log('ERROR: Cannot extract meaningful page content!', '❌');
        logger.log('💡 Try running: node cli.js inspect --url ' + currentUrl, '');
        journey.outcome = 'content-extraction-failed';
        break;
      }

      // Apply persona-specific content strategy
      let currentContent;
      let usedFullContent = false;
      const strategy = behavior.contentStrategy;

      logger.log(`Persona: ${persona.name} (${strategy.mode} mode)`, '🎭');

      if (strategy.mode === 'full-always') {
        // Methodical learner: always use maximum content
        currentContent = pageInfo.fullContent;
        usedFullContent = true;
        logger.log(`Loading full content (${currentContent.length} chars) - methodical reading`, '📚');
        journey.tokenStats.totalContentCharsSent += currentContent.length;
        
      } else if (strategy.mode === 'keyword-search') {
        // Expert/Debugger: extract targeted content around keywords
        const targeted = await behavior.extractTargetedContent(page, goal, pageInfo.fullContent);
        currentContent = targeted
        logger.log(`Extracted keyword-targeted content (${currentContent.length} chars) - Ctrl+F simulation`, '🔍');
        journey.tokenStats.totalContentCharsSent += currentContent.length;
        
      } else {
        // Progressive disclosure for beginners
        currentContent = pageInfo.contentPreview.substring(0, strategy.initialChars);
        logger.log(`Starting with preview (${currentContent.length} chars)`, '👀');
        journey.tokenStats.totalContentCharsSent += currentContent.length;
      }

      // Prepend page structure (headings) to help Claude understand the page layout
      let contentWithStructure = currentContent;
      if (pageInfo.headings && pageInfo.headings.length > 0) {
        const headingsList = pageInfo.headings.map(h => `  • ${h}`).join('\n');
        const structureInfo = `[Page sections on this page:\n${headingsList}]\n\n`;
        contentWithStructure = structureInfo + currentContent;
        
        if (!usedFullContent) {
          journey.tokenStats.totalContentCharsSent += structureInfo.length;
        }
      }

      const preview = currentContent.substring(0, 150).replace(/\n/g, ' ').replace(/\s+/g, ' ');
      logger.log(`Preview: "${preview}..."`, '👀');

      // Extract and filter links
      const links = await extractLinks(page, siteConfig, currentUrl);
      logger.log(`Found ${links.length} links`, '🔗');

      const { filteredLinks, removedCount } = filterLinks(links, currentUrl);
      
      if (removedCount > 0) {
        logger.log(`Filtered out ${removedCount} link(s) (same page or off-site)`, '🚫');
      }

      if (filteredLinks.length === 0) {
        logger.log('No valid links found on this page', '⚠️');
        journey.outcome = 'no-links';
        break;
      }

      // APPLY PERSONA LINK PRIORITIZATION
      const prioritizedLinks = behavior.selectLink(filteredLinks, goal);

      if (JSON.stringify(prioritizedLinks) !== JSON.stringify(filteredLinks)) {
        logger.log(`Links reordered by persona preference`, '✨');
      }

      // First decision (with preview or full content if revisit)
      let decision = await decideNextStep(
        { ...pageInfo, content: contentWithStructure },
        prioritizedLinks,
        persona,
        goal,
        apiKey
      );

      // Check if Claude needs more context (only for progressive mode)
      if (strategy.mode === 'progressive' && !usedFullContent) {
        const needsMoreSignals = [
          decision.confidence === 'medium',
          decision.confidence === 'low',
          decision.reasoning.toLowerCase().includes('cut off'),
          decision.reasoning.toLowerCase().includes('brief'),
          decision.reasoning.toLowerCase().includes('summary'),
          decision.reasoning.toLowerCase().includes('need more'),
          decision.reasoning.toLowerCase().includes('can\'t see'),
          decision.reasoning.toLowerCase().includes('incomplete')
        ];

        const needsMore = needsMoreSignals.filter(Boolean).length >= 2;
        const shouldLoad = strategy.loadFullOn.includes(decision.confidence);

        if ((needsMore || shouldLoad) && pageInfo.totalLength > strategy.initialChars) {
          logger.log('Claude needs more context, sending full content...', '📚');
          
          // For keyword-targeted, re-extract with more context
          if (strategy.mode === 'keyword-targeted') {
            currentContent = await behavior.extractTargetedContent(page, goal, pageInfo.fullContent);
            currentContent = currentContent.substring(0, strategy.fullChars);
          } else {
            currentContent = pageInfo.fullContent.substring(0, strategy.fullChars);
          }
          
          usedFullContent = true;
          journey.tokenStats.progressiveLoadCount++;
          journey.tokenStats.totalContentCharsSent += (currentContent.length - pageInfo.contentPreview.substring(0, strategy.initialChars).length);
          
          logger.log(`Sending additional ${currentContent.length - pageInfo.contentPreview.substring(0, strategy.initialChars).length} chars`, '📤');
          
          // Rebuild contentWithStructure with full content
          let fullContentWithStructure = currentContent;
          if (pageInfo.headings && pageInfo.headings.length > 0) {
            const headingsList = pageInfo.headings.map(h => `  • ${h}`).join('\n');
            fullContentWithStructure = `[Page sections on this page:\n${headingsList}]\n\n${currentContent}`;
          }
          
          // Re-decide with full content
          decision = await decideNextStep(
            { ...pageInfo, content: fullContentWithStructure },
            prioritizedLinks,
            persona,
            goal,
            apiKey
          );
        }
      }

      logger.log(`Claude (${decision.confidence}${usedFullContent ? ', full content' : ''}): ${decision.reasoning}`, '🤖');

      const stepRecord = {
        stepNumber: currentStep + 1,
        page: {
          ...pageInfo,
          content: currentContent,
          usedFullContent: usedFullContent
        },
        availableLinks: filteredLinks.length,
        decision: decision
      };

      journey.steps.push(stepRecord);

      if (decision.action === 'success') {
        logger.log('SUCCESS! Claude found what it needed!', '✅');
        journey.outcome = 'success';
        break;
      } else if (decision.action === 'stuck') {
        logger.log('STUCK! Claude can\'t find the answer.', '❌');
        journey.outcome = 'stuck';
        break;
      } else if (decision.action === 'click') {
        const targetLink = prioritizedLinks[decision.linkIndex - 1];
        if (!targetLink) {
          logger.log('Invalid link index!', '⚠️');
          journey.outcome = 'error';
          break;
        }

        logger.log(`Clicking: ${targetLink.text}`, '👆');
        
        try {
          logger.log('Loading next page...', '⏳');
          await page.goto(targetLink.href, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
          });
          await page.waitForTimeout(1000);
        } catch (navError) {
          logger.log(`Navigation warning: ${navError.message}`, '⚠️');
        }
      }

      currentStep++;
    }

    if (currentStep >= maxSteps) {
      logger.log('Reached max steps', '⏱️');
      journey.outcome = 'timeout';
    }

    // Generate feedback report based on outcome
    if (journey.outcome === 'success') {
      logger.log('\n📝 Generating success feedback...', '');
      
      const successFeedback = await generateSuccessFeedback(journey, persona, goal, apiKey);
      
      if (successFeedback) {
        journey.successFeedback = successFeedback;
        logger.log('✅ Success feedback generated', '');
        
        if (successFeedback.needsImprovement) {
          logger.log(`Content style: ${successFeedback.contentStyleMatch}`, '💡');
          logger.log(`Gap: ${successFeedback.contentGap}`, '');
        } else {
          logger.log(`Content style: perfect match!`, '🎯');
        }
      }
    } else if (journey.outcome === 'loop-detected' || journey.outcome === 'stuck' || journey.outcome === 'timeout') {
      logger.log('\n📝 Generating failure feedback...', '');
      
      const feedbackReport = await generateFeedbackReport(journey, persona, goal, apiKey);
      
      if (feedbackReport) {
        journey.feedbackReport = feedbackReport;
        logger.log('✅ Feedback report generated', '');
        logger.log(`Problem: ${feedbackReport.problem}`, '💡');
      }
    }

    // Log token stats
    logger.log(`\n💰 Token efficiency stats:`, '');
    logger.log(`   Total content sent: ${journey.tokenStats.totalContentCharsSent} chars (~${Math.round(journey.tokenStats.totalContentCharsSent / 4)} tokens)`, '');
    logger.log(`   Progressive loads: ${journey.tokenStats.progressiveLoadCount} times`, '');

  } catch (error) {
    const sanitizedError = error.message.replace(/\/[^\s]+\//g, '[PATH]/');
    logger.log(`Error: ${sanitizedError}`, '💥');
    journey.outcome = 'error';
    journey.error = sanitizedError;
  } finally {
    await browser.close();
  }

  // Save the journey JSON
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `${outputDir}/journey-${personaKey}-${Date.now()}.json`;
  await fs.writeFile(filename, JSON.stringify(journey, null, 2));
  
  journey.filename = filename;
  
  // Save the log file if needed
  if (saveLog) {
    const logFilename = `${outputDir}/log-${personaKey}-${Date.now()}.txt`;
    await logger.saveLogs(logFilename);
    journey.logFilename = logFilename;
  }
  
  return journey;
}