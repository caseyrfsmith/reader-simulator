import Anthropic from '@anthropic-ai/sdk';
import { getPersonaBehavior } from './personaBehaviors.js';

export async function decideNextStep(currentPage, availableLinks, persona, goal, apiKey) {
  const client = new Anthropic({
    apiKey: apiKey,
  });

  // Get behavior for success criteria
  const personaKey = persona.name.toLowerCase().replace(/\s+/g, '-');
  const behavior = getPersonaBehavior(personaKey);
  
  const successCriteriaText = behavior?.successCriteria 
    ? `\n\nYou will DECLARE SUCCESS if you find ANY of these:\n${behavior.successCriteria.map(c => `• ${c}`).join('\n')}`
    : '';

  const prompt = `You are a ${persona.name}: ${persona.description}

Your goal: ${goal}
${successCriteriaText}

You are currently on a page titled: "${currentPage.title}"

Page content:
${currentPage.content}

Available links to click${behavior?.selectLink ? ' (prioritized by your preferences)' : ''}:
${availableLinks.map((link, i) => `${i + 1}. ${link.text}`).join('\n')}

IMPORTANT DECISION CRITERIA:

1. DECLARE SUCCESS if the current page content directly answers your goal:
   - Contains code examples, API endpoints, or configuration details for your goal
   - Shows request/response formats, headers, or authentication methods
   - Includes curl examples, SDK code, or step-by-step instructions
   - Has tables, reference docs, or specifications relevant to your goal
   - Even if brief or not perfectly formatted - if the INFO is there, declare success
   - Don't keep searching if this page answers your question, even partially

2. CLICK to navigate if:
   - The current page only MENTIONS your topic without details
   - You need more specific information than what's provided
   - The page is clearly just an index/overview pointing elsewhere
   - The page explicitly directs you to another section for this info

3. DECLARE STUCK if:
   - You've read multiple pages and none explain your topic
   - The documentation doesn't seem to cover your goal at all
   - You're visiting the same pages repeatedly

CRITICAL: If you see code examples, curl commands, or specific technical details that answer the goal, DECLARE SUCCESS immediately. Don't overthink it.

Consider your persona's behavior:
${JSON.stringify(persona.behaviors, null, 2)}

What should you do next? Respond with ONLY a JSON object (no markdown, no code blocks):
{
  "reasoning": "Explain your decision in 1-2 sentences. If declaring success, quote the specific content that answers your goal.",
  "action": "click" or "success" or "stuck",
  "linkIndex": number (only if action is "click", 1-indexed),
  "confidence": "high" or "medium" or "low",
  "contentStyleMatch": "perfect" or "acceptable" or "poor" (only if action is "success" - how well does the content format match your persona's preferences?)
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    
    // Strip markdown code blocks if present
    const cleanedText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    console.log('\n🤖 Claude says:', cleanedText);
    
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Claude decision failed:', error);
    return { action: 'stuck', reasoning: 'API error', confidence: 'low' };
  }
}