import Anthropic from '@anthropic-ai/sdk';

export async function generateFeedbackReport(journey, persona, goal, apiKey) {
  const client = new Anthropic({ apiKey });
  
  try {
    const journeySummary = journey.steps.map((step, i) => 
      `Step ${i + 1}: "${step.page.title}"\nContent: ${step.page.content.substring(0, 300)}...\nDecision: ${step.decision.reasoning}`
    ).join('\n\n---\n\n');
    
    const reportPrompt = `You are a ${persona.name}: ${persona.description}

Your goal was: ${goal}

You attempted to navigate documentation but ${journey.outcome === 'loop-detected' ? 'got stuck in a loop' : journey.outcome === 'timeout' ? 'ran out of steps' : 'got stuck'}. Here's what happened:

${journeySummary}

As a documentation expert analyzing this failed journey, provide a brief report on what went wrong and what the documentation is missing.

Respond with ONLY a JSON object:
{
  "problem": "One sentence describing the core issue (what was the navigation problem?)",
  "missingContent": "What specific content, examples, or information were you looking for but couldn't find?",
  "recommendation": "One specific, actionable improvement the documentation team should make",
  "userImpact": "How does this issue affect users like you? (one sentence)"
}`;

    const reportResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: reportPrompt }]
    });
    
    const reportText = reportResponse.content[0].text;
    const cleanedReport = reportText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    return JSON.parse(cleanedReport);
  } catch (error) {
    console.error('⚠️ Could not generate feedback report:', error.message);
    return null;
  }
}

export async function generateSuccessFeedback(journey, persona, goal, apiKey) {
  const client = new Anthropic({ apiKey });
  
  try {
    const successStep = journey.steps[journey.steps.length - 1];
    const contentStyleMatch = successStep.decision.contentStyleMatch || 'acceptable';
    
    // If content style was perfect, no need for detailed feedback
    if (contentStyleMatch === 'perfect') {
      return {
        contentStyleMatch: 'perfect',
        foundAnswer: successStep.decision.reasoning,
        needsImprovement: false
      };
    }
    
    // Generate feedback for non-perfect content matches
    const successPrompt = `You are a ${persona.name}: ${persona.description}

Your goal was: ${goal}

You successfully found the answer on this page: "${successStep.page.title}"

Content that answered your goal:
${successStep.page.content.substring(0, 1500)}

However, you indicated the content style was "${contentStyleMatch}" for your preferences (not perfect).

As a documentation expert, provide brief feedback on how the documentation could better serve users like you.

Consider your persona's behaviors:
${JSON.stringify(persona.behaviors, null, 2)}

Respond with ONLY a JSON object:
{
  "foundAnswer": "One sentence: what specific information answered your goal?",
  "contentGap": "What style or format would have been more helpful for your persona? Be specific (e.g., 'needed step-by-step tutorial instead of API reference', 'wanted interactive examples', 'preferred quick reference table')",
  "recommendation": "One specific improvement to better serve users like you",
  "impact": "low" or "medium" or "high" (how much would this improvement help users like you?)"
}`;

    const successResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: successPrompt }]
    });
    
    const successText = successResponse.content[0].text;
    const cleanedSuccess = successText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const feedback = JSON.parse(cleanedSuccess);
    
    return {
      ...feedback,
      contentStyleMatch,
      needsImprovement: true
    };
  } catch (error) {
    console.error('⚠️ Could not generate success feedback:', error.message);
    return {
      contentStyleMatch: successStep?.decision?.contentStyleMatch || 'unknown',
      foundAnswer: successStep?.decision?.reasoning || 'Unknown',
      needsImprovement: false,
      error: error.message
    };
  }
}