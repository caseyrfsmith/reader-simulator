#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { runJourney } from './journey.js';
import { inspectSite, formatInspectionReport } from './inspector.js';
import { generateReport, formatReport } from './reporter.js';

dotenv.config();

// Load config files
const personas = JSON.parse(await fs.readFile('./config/personas.json', 'utf-8'));
const goals = JSON.parse(await fs.readFile('./config/goals.json', 'utf-8'));

const program = new Command();

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

program
  .name('doc-tester')
  .description('Load test documentation with AI personas')
  .version('1.0.0')
  .helpOption('-h, --help', 'Display help for command');

program
  .command('run')
  .description('Run a documentation test with a specific persona and goal')
  .requiredOption('-u, --url <url>', 'Starting URL for the documentation')
  .requiredOption('-p, --persona <persona>', `Persona to use (${Object.keys(personas).join(', ')})`)
  .requiredOption('-g, --goal <goal>', `Goal to achieve (${Object.keys(goals).join(', ')})`)
  .option('-s, --steps <number>', 'Maximum steps to take', '10')
  .option('--headless', 'Run browser in headless mode', false)
  .option('-o, --output <path>', 'Output directory for results', 'journeys')
  .option('--save-log', 'Save terminal output to log file', false)
  .action(async (options) => {

    // Validate URL
    if (!isValidUrl(options.url)) {
      console.error('❌ Invalid URL. Must start with http:// or https://');
      process.exit(1);
}
    // Validate persona
    if (!personas[options.persona]) {
      console.error(`❌ Unknown persona: ${options.persona}`);
      console.log(`Available personas: ${Object.keys(personas).join(', ')}`);
      process.exit(1);
    }

    // Validate goal
    if (!goals[options.goal]) {
      console.error(`❌ Unknown goal: ${options.goal}`);
      console.log(`Available goals: ${Object.keys(goals).join(', ')}`);
      process.exit(1);
    }

    const persona = personas[options.persona];
    const goal = goals[options.goal];
    const maxSteps = parseInt(options.steps);

    console.log('\n🚀 Starting documentation test');
    console.log(`👤 Persona: ${persona.name}`);
    console.log(`🎯 Goal: ${goal}`);
    console.log(`🔗 Starting at: ${options.url}`);
    console.log(`📍 Max steps: ${maxSteps}\n`);

    const result = await runJourney({
      startUrl: options.url,
      goal: goal,
      persona: persona,
      personaKey: options.persona,
      maxSteps: maxSteps,
      showBrowser: !options.headless,
      outputDir: options.output,
      saveLog: options.saveLog,
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📊 RESULT: ${result.outcome.toUpperCase()}`);
    console.log(`📍 Steps taken: ${result.steps.length}`);
    console.log(`💾 Journey saved to: ${result.filename}`);
    
    if (result.logFilename) {
      console.log(`📋 Log saved to: ${result.logFilename}`);
    }
    
    // Show success feedback if available
    if (result.outcome === 'success' && result.successFeedback) {
      if (result.successFeedback.needsImprovement) {
        console.log(`\n✅ SUCCESS - But content style could be better:`);
        console.log(`   Content match: ${result.successFeedback.contentStyleMatch}`);
        console.log(`   Found: ${result.successFeedback.foundAnswer}`);
        console.log(`   Gap: ${result.successFeedback.contentGap}`);
        console.log(`   💡 Recommendation: ${result.successFeedback.recommendation}`);
        console.log(`   Impact: ${result.successFeedback.impact}`);
      } else {
        console.log(`\n✅ PERFECT SUCCESS!`);
        console.log(`   Content style was a perfect match for this persona`);
      }
    }
    
    // Show failure feedback if available
    if (result.feedbackReport) {
      console.log(`\n💡 ACTIONABLE INSIGHT:`);
      console.log(`   Problem: ${result.feedbackReport.problem}`);
      console.log(`   Recommendation: ${result.feedbackReport.recommendation}`);
    }
    
    console.log('='.repeat(60) + '\n');
  });

program
  .command('inspect')
  .description('Inspect a docs site and suggest a configuration')
  .requiredOption('-u, --url <url>', 'URL to inspect')
  .action(async (options) => {
    if (!isValidUrl(options.url)) {
      console.error('❌ Invalid URL. Must start with http:// or https://');
      process.exit(1);
    }
    console.log('\n🔍 Inspecting documentation site...\n');
    
    try {
      const analysis = await inspectSite(options.url);
      const report = formatInspectionReport(analysis);
      console.log(report);
    } catch (error) {
      console.error('❌ Error inspecting site:', error.message);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate a report from journey files')
  .requiredOption('-d, --dir <directory>', 'Directory containing journey files')
  .action(async (options) => {
    try {
      const analysis = await generateReport(options.dir);
      const report = formatReport(analysis);
      console.log(report);
    } catch (error) {
      console.error('❌ Error generating report:', error.message);
      process.exit(1);
    }
  });

program
  .command('list-personas')
  .description('List all available personas')
  .action(() => {
    console.log('\n📋 Available Personas:\n');
    Object.entries(personas).forEach(([key, persona]) => {
      console.log(`  ${key}`);
      console.log(`    Name: ${persona.name}`);
      console.log(`    Description: ${persona.description}`);
      console.log('');
    });
  });

program
  .command('list-goals')
  .description('List all available goals')
  .action(() => {
    console.log('\n🎯 Available Goals:\n');
    Object.entries(goals).forEach(([key, goal]) => {
      console.log(`  ${key}: ${goal}`);
    });
    console.log('');
  });

program.parse();