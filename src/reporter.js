import fs from 'fs/promises';

export async function generateReport(directory) {
  const files = await fs.readdir(directory);
  const journeyFiles = files.filter(f => f.startsWith('journey-') && f.endsWith('.json'));
  
  const journeys = await Promise.all(
    journeyFiles.map(async f => JSON.parse(await fs.readFile(`${directory}/${f}`, 'utf-8')))
  );
  
  return analyzeJourneys(journeys);
}

function analyzeJourneys(journeys) {
  const outcomes = {};
  const failures = [];
  const successImprovements = [];
  let totalSteps = 0;
  let totalTokens = 0;
  
  journeys.forEach(j => {
    outcomes[j.outcome] = (outcomes[j.outcome] || 0) + 1;
    totalSteps += j.steps.length;
    if (j.tokenStats) {
      totalTokens += Math.round(j.tokenStats.totalContentCharsSent / 4);
    }
    
    // Collect failure feedback
    if (j.feedbackReport) {
      failures.push({
        persona: j.personaKey,
        goal: j.goal,
        site: new URL(j.startUrl).hostname,
        outcome: j.outcome,
        ...j.feedbackReport
      });
    }
    
    // Collect success feedback where content style wasn't perfect
    if (j.outcome === 'success' && j.successFeedback?.needsImprovement) {
      successImprovements.push({
        persona: j.personaKey,
        goal: j.goal,
        site: new URL(j.startUrl).hostname,
        steps: j.steps.length,
        ...j.successFeedback
      });
    }
  });
  
  return {
    journeyCount: journeys.length,
    outcomes,
    totalSteps,
    totalTokens,
    averageSteps: Math.round(totalSteps / journeys.length),
    estimatedCost: (totalTokens * 0.000003).toFixed(4),
    failures,
    successImprovements
  };
}

export function formatReport(analysis) {
  let report = `\n📊 Analyzing ${analysis.journeyCount} journeys...\n\n`;
  
  report += '📈 Success Metrics:\n';
  Object.entries(analysis.outcomes).forEach(([outcome, count]) => {
    const percentage = Math.round((count / analysis.journeyCount) * 100);
    const icon = outcome === 'success' ? '✅' : '❌';
    report += `   ${icon} ${outcome}: ${count} (${percentage}%)\n`;
  });
  
  report += `\n📊 Efficiency:\n`;
  report += `   Average steps: ${analysis.averageSteps}\n`;
  report += `   Total tokens used: ~${analysis.totalTokens}\n`;
  report += `   Cost estimate: ~$${analysis.estimatedCost}\n`;
  
  // Success improvements section
  if (analysis.successImprovements.length > 0) {
    report += '\n💡 Successful BUT Could Be Better:\n';
    report += `   ${analysis.successImprovements.length} journey(s) found answers but content style wasn't ideal\n\n`;
    
    analysis.successImprovements.forEach((improvement, i) => {
      report += `${i + 1}. [${improvement.site}] ${improvement.foundAnswer}\n`;
      report += `   Persona: ${improvement.persona} (${improvement.steps} steps)\n`;
      report += `   Goal: ${improvement.goal}\n`;
      report += `   Content style: ${improvement.contentStyleMatch}\n`;
      report += `   Gap: ${improvement.contentGap}\n`;
      report += `   💡 Fix: ${improvement.recommendation}\n`;
      report += `   Impact: ${improvement.impact}\n\n`;
    });
  }
  
  // Failure section
  if (analysis.failures.length > 0) {
    report += '\n🔴 Documentation Issues Found:\n\n';
    analysis.failures.forEach((fb, i) => {
      report += `${i + 1}. [${fb.site}] ${fb.problem}\n`;
      report += `   Persona: ${fb.persona}\n`;
      report += `   Goal: ${fb.goal}\n`;
      report += `   Outcome: ${fb.outcome}\n`;
      report += `   Missing: ${fb.missingContent}\n`;
      report += `   💡 Fix: ${fb.recommendation}\n`;
      report += `   💥 Impact: ${fb.userImpact}\n\n`;
    });
  } else if (analysis.successImprovements.length === 0) {
    report += '\n✅ Perfect! All journeys succeeded with ideal content formats!\n';
  }
  
  return report;
}