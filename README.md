# Developer docs simulated reader

This is an experimental tool that simulates different user personas navigating documentation sites to measure success rates, identify navigation issues, and provide actionable insights for documentation teams.

## Overview

This tool uses AI (Claude via the Anthropic API) to simulate real users trying to accomplish specific goals in documentation. It tracks navigation paths, detects problems, and generates detailed reports on documentation usability issues. Even when tests succeed, it evaluates whether the content format matches the user's learning style.

### Key features

- **Persona-based testing** - Simulate different user types (beginners, experts, debuggers) with realistic navigation behaviors
- **Persona-specific content strategies** - Each persona reads and searches content differently:
  - Beginners use progressive loading (preview first, full content if needed)
  - Experts simulate Ctrl+F keyword search with large context windows
  - Methodical learners always read full content
  - Debuggers search for error-related keywords
- **Smart link prioritization** - Personas prioritize different types of links (tutorials vs API reference)
- **Site configuration system** - Define custom content selectors for different documentation sites
- **Content style evaluation** - Identifies when users find answers but the format doesn't match their learning preferences
- **Automated feedback generation** - Generates actionable insights about what's wrong and how to fix it
- **Loop detection** - Identifies when users get stuck in circular navigation patterns
- **Aggregate reporting** - Analyze multiple test runs to identify patterns and prioritize fixes

### Caveats / Check your expectations

This is an experimental project that I dialed in using Stripe's docs and Payabli's docs. It's optimized for doc sets I deal with, so it's not perfect, but it's a great start. I'm not a developer and this isn't meant to replace actual user testing—it was a fun weekend project. It's being provided as-is and I really can't help you tailor it to your own use cases outside of what's offered in the README. Please don't kill the vibe by yelling at me, okay?

Not every persona needs to achieve every goal. As much as we'd love for every nervous beginner to be able to set up an SDK and get production-ready integration in 30 seconds, it's not realistic. Likewise, an impatient expert is not going to struggle to understand basic auth for making REST calls. This is not a complete solution, nor does it replace the need to be discerning about test results. This kind of testing still needs a content person's expertise.

## TL;DR for how all this works together

The next few sections give a high level overview of what each file does and how everything hangs together.

### Core components

#### journey.js - Main orchestrator

- Manages Playwright browser automation
- Coordinates content extraction, link selection, Claude decisions
- Handles loop detection (stops if URL visited 3+ times)
- Tracks token usage and progressive loading events
- Generates journey JSON files with complete step history

#### decideNextStep.js - AI decision engine

- Formats prompts with page content, available links, persona behaviors
- Sends to Claude API (Sonnet 4)
- Parses JSON responses (with markdown code block stripping)
- Returns: action (click/success/stuck), reasoning, confidence level

#### personaBehaviors.js - Behavior logic

- Defines link prioritization algorithms for each persona
- Implements content strategies (progressive/keyword-search/full-always)
- Defines success criteria per persona
- Keyword extraction for targeted content

#### contentExtractor.js - Smart content extraction

- Site-specific selectors from `sites.json` config
- Universal fallback using semantic HTML (article, main, etc.)
- Finds element with most substantive text content
- Extracts page structure (headings) to help Claude understand layout
- Tracks content source for debugging

#### linkExtractor.js - Navigation link extraction

- Extracts from nav, sidebar, and main content areas
- Filters out same-page anchors and off-site links
- Deduplicates by URL
- Limits to top 20 links to avoid overwhelming Claude

#### feedbackGenerator.js - AI-powered insights

- Uses separate Claude API calls to analyze complete journeys
- Success feedback: evaluates content style match
- Failure feedback: identifies documentation gaps
- Returns structured JSON with problem, recommendation, impact

#### inspector.js - Site analysis tool

- Analyzes documentation sites to find best content selectors
- Recommends configuration for `sites.json`
- Helps users add new documentation sites quickly

#### reporter.js - Aggregate analysis

- Analyzes multiple journey JSON files
- Calculates success metrics across personas and goals
- Estimates token usage and API costs
- Identifies patterns in failures and content style mismatches
- Generates prioritized list of documentation issues

#### cli.js - Command-line interface

- `run` - Execute single test (persona + goal + URL)
- `inspect` - Analyze docs site and suggest config
- `report` - Generate aggregate report from journey files
- `list-personas` / `list-goals` - Show available options
- Built with Commander.js, includes help text and validation

### Configuration files

#### personas.json - User persona definitions

- Name, description, and behavior flags for each persona
- Displayed to Claude to inform decision-making
- Separate from implementation in personaBehaviors.js

#### goals.json - Common documentation tasks

- Simple key-value pairs of goal ID to goal description
- Examples: "authenticate", "first-request", "debug-error"
- Expandable for different documentation domains

#### sites.json - Site-specific configurations

- Custom content selectors per documentation site
- Domains to exclude from link extraction
- Fallback "_default" config for unknown sites

### Usage flow

1. **User runs CLI command** with URL, persona, goal
2. **Journey starts:** Browser launches, navigates to URL
3. **Content extraction:** Page content extracted using site config or universal fallback
4. **Persona processing:** Content filtered/modified based on persona's reading strategy
5. **Link extraction:** Available links extracted and prioritized by persona preferences
6. **Claude decision:** Content + links sent to Claude API for decision
7. **Progressive loading:** If confidence low and progressive mode, load full content and re-decide
8. **Action execution:** Click link, declare success, or stuck
9. **Loop detection:** Check if URL visited 3+ times
10. **Repeat** until success, stuck, or max steps reached
11. **Feedback generation:** AI analyzes journey and generates insights
12. **Output:** Journey JSON saved with complete history and feedback

## Prerequisites

- Node.js - Version 18 or higher
- npm - Comes with Node.js
- Anthropic API key - Get one at console.anthropic.com

## Security

- **Never commit your `.env` file** - it contains your API key
- The `.env.example` file shows what variables you need
- Get your Anthropic API key from https://console.anthropic.com/settings/keys
- Keep your API key secret - don't share it in screenshots, logs, or commits

## Dependencies

This project uses:

- @anthropic-ai/sdk - Claude API client for AI decision-making
- playwright - Browser automation for navigation simulation
- commander - CLI framework
- dotenv - Environment variable management

All dependencies are installed automatically with `npm install`.

## Installation

1. Clone this repository:
```bash
git clone https://github.com/caseyrfsmith/reader-simulator.git
cd reader-simulator
```

2. Install dependencies:
```bash
npm install
```

3. Set up your Anthropic API key:
```bash
cp .env.example .env
# Edit .env and add your API key: ANTHROPIC_API_KEY=sk-ant-...
```

4. Verify installation:
```bash
node src/cli.js list-personas
```

## Quick start

The project comes with five personas defined in `personas.json` and `personaBehaviors.js`. You can add or edit personas as needed.

### 1. Inspect a documentation site

First, identify the best content selector for a site:

```bash
node src/cli.js inspect --url https://docs.stripe.com
```

This will show you potential content containers and recommend a configuration.

### 2. Add site configuration

Update `config/sites.json` with the recommended configuration. For example:

```json
{
  "docs.stripe.com": {
    "name": "Stripe Documentation",
    "contentSelector": "article#content",
    "excludeLinks": ["dashboard.stripe.com", "stripe.com/blog"]
  },
  "_default": {
    "name": "Unknown Site",
    "contentSelector": null,
    "excludeLinks": []
  }
}
```

### 3. Run a test

```bash
node src/cli.js run \
  --url https://docs.stripe.com \
  --persona confused-beginner \
  --goal authenticate
```

### 4. Review results

Results are saved to the `journeys/` directory. Successful tests include a `successFeedback` object that evaluates content style fit. Failed tests include a `feedbackReport` with actionable insights.

## Example output

See the `examples/` directory for sample journey files and reports

## CLI commands

**Get help:**
```bash
node src/cli.js -h              # Show all commands
node src/cli.js run -h          # Help for specific command
```

### `run`

Run a documentation test with a specific persona and goal.

```bash
node src/cli.js run \
  --url <url> \
  --persona <persona-key> \
  --goal <goal-key> \
  [--steps <number>] \
  [--headless] \
  [--output <directory>] \
  [--save-log]
```

**Options:**
- `-u, --url` - Starting URL for the documentation
- `-p, --persona` - Persona to use (see available personas with `list-personas`)
- `-g, --goal` - Goal to achieve (see available goals with `list-goals`)
- `-s, --steps` - Maximum steps to take (default: 10)
- `--headless` - Run browser in headless mode
- `-o, --output` - Output directory for results (default: journeys)
- `--save-log` - Save terminal output to log file

### `inspect`

Analyze a documentation site and suggest configuration.

```bash
node src/cli.js inspect --url <url>
```

### `report`

Generate aggregate report from multiple journey files.

```bash
node src/cli.js report --dir <directory>
```

Outputs:
- Success metrics across all tests
- Content style feedback for successful journeys
- Token usage and cost estimates
- List of documentation issues found with recommendations

### `list-personas`

Show all available personas.

```bash
node src/cli.js list-personas
```

### `list-goals`

Show all available goals.

```bash
node src/cli.js list-goals
```

## Configuration files

### `config/personas.json`

Define different user types to simulate. This file contains the persona definitions that are displayed to Claude, while `personaBehaviors.js` contains the actual behavior logic.

```json
{
  "confused-beginner": {
    "name": "Confused Beginner",
    "description": "New to programming, learning step by step, easily overwhelmed by jargon. Prefers tutorials and examples over reference docs.",
    "behaviors": {
      "prefersExamples": true,
      "avoidsAdvancedTopics": true,
      "needsHandHolding": true,
      "patience": "low"
    }
  }
}
```

### `config/goals.json`

Define common tasks users try to accomplish.

```json
{
  "authenticate": "Figure out how to authenticate API requests",
  "first-request": "Make my first API call successfully",
  "debug-error": "Fix a 401 Unauthorized error"
}
```

### `config/sites.json`

Configure content extraction for specific sites.

```json
{
  "docs.example.com": {
    "name": "Example Documentation",
    "contentSelector": "article#content",
    "excludeLinks": ["dashboard.example.com"]
  }
}
```

## How personas work

Each persona has distinct behaviors defined in `personaBehaviors.js` that affect how they navigate and read content:

### Confused beginner
- **Link prioritization:** Heavily favors tutorials, guides, "getting started" pages; avoids API references
- **Content strategy:** Progressive loading - starts with 1500 chars, loads up to 5000 if uncertain
- **Success criteria:** Looks for step-by-step tutorials, copy-paste examples, plain explanations
- **Reading style:** Needs full context, doesn't skip content

### Efficient developer
- **Link prioritization:** Heavily favors API reference, documentation pages; penalizes guides/tutorials
- **Content strategy:** Keyword search mode - simulates Ctrl+F by extracting large sections (1000 chars each side) around goal keywords
- **Success criteria:** Looks for API endpoints, code examples, request/response formats, parameter tables
- **Reading style:** Loads maximum content (5000 chars) and uses keyword extraction to find relevant sections

### Methodical learner
- **Link prioritization:** Doesn't reorder - respects document structure and reads sequentially
- **Content strategy:** Full-always mode - always loads maximum content (5000 chars)
- **Success criteria:** Looks for complete explanations, clear prerequisites, comprehensive examples
- **Reading style:** Reads everything thoroughly, follows documentation in order

### Casual browser
- **Link prioritization:** Balanced - moderate preferences for guides and API docs
- **Content strategy:** Progressive loading - starts with 2000 chars, loads up to 4000 if needed
- **Success criteria:** Accepts either tutorial-style or reference-style content
- **Reading style:** Moderate keyword search with 400-char context windows

### Desperate debugger
- **Link prioritization:** Heavily favors troubleshooting, error pages, FAQs, "fix" content
- **Content strategy:** Keyword search mode - extracts sections around error-related keywords with 600-char windows
- **Success criteria:** Looks for error explanations, troubleshooting steps, quick fixes
- **Reading style:** Urgently searches for problem-specific content, includes keywords like "error", "fix", "solution"

## Output format

### Journey files

Each test run creates a JSON file with:
- Persona and goal information
- Step-by-step navigation history
- Decision reasoning at each step
- Final outcome (success, loop-detected, stuck, timeout, error)
- Token usage statistics including:
  - Total content characters sent
  - Number of progressive loads triggered
- Success feedback (for successful tests)
- Failure feedback (for failed tests)

### Success feedback

When tests succeed, the tool evaluates content style fit:

```json
{
  "successFeedback": {
    "contentStyleMatch": "acceptable",
    "foundAnswer": "API authentication uses requestToken header",
    "contentGap": "Needed step-by-step tutorial instead of API reference",
    "recommendation": "Create 'Getting Started with Authentication' tutorial",
    "impact": "high",
    "needsImprovement": true
  }
}
```

**Content style ratings:**
- `perfect` - Content format matches persona's preferences exactly
- `acceptable` - Found the answer but would prefer different format
- `poor` - Answer is there but format is frustrating for this persona

### Failure feedback

When tests fail, the tool generates:

```json
{
  "feedbackReport": {
    "problem": "User got stuck in circular navigation loop",
    "missingContent": "Complete code examples showing authentication headers",
    "recommendation": "Add dedicated Authentication Tutorial page",
    "userImpact": "Beginners can't progress past basic concepts"
  }
}
```

## How it works

### Content extraction

The tool uses a multi-strategy approach:
1. First tries site-specific selectors from `config/sites.json`
2. Falls back to universal selectors (article, main, etc.)
3. Finds the element with the most substantive text content
4. Filters out navigation and other non-content elements
5. Extracts page structure (headings) to help Claude understand organization

### Persona-specific content strategies

Different personas read content differently:

**Progressive loading** (Confused Beginner, Casual Browser):
- Initially sends a preview (1500-2000 chars)
- If Claude indicates uncertainty, loads full content (4000-5000 chars)
- Tracks how often progressive loading is triggered

**Keyword search** (Efficient Developer, Desperate Debugger):
- Extracts goal-related keywords
- Finds large sections around those keywords (600-1000 chars each side)
- Simulates using Ctrl+F to find relevant content quickly
- Debuggers add error-related keywords automatically

**Full-always** (Methodical Learner):
- Always loads maximum content (5000 chars)
- Reads everything thoroughly
- No progressive loading

### Navigation

At each step:
1. Extract page content using persona's content strategy
2. Extract and prioritize links based on persona preferences
3. Claude evaluates the content against success criteria
4. Claude decides: click a link, declare success, or indicate being stuck
5. Provides reasoning and content style evaluation

### Loop detection

Tracks visited URLs and stops if the same URL is visited 3+ times, indicating the user is stuck in a navigation loop.

### Feedback generation

**When a test succeeds:**
- Claude evaluates if content style matches persona preferences
- If not perfect, generates specific recommendations for improvement

**When a test fails:**
- Summarizes the entire journey
- Asks Claude to analyze what went wrong from the persona's perspective
- Generates specific, actionable recommendations

## Example workflow

Test docs with multiple personas:

```bash 
# Test with efficient developer persona
node src/cli.js run \
  --url https://yourdocs.com/developers/developer-overview \
  --persona efficient-developer \
  --goal authenticate \
  --steps 10

# Test with beginner persona
node src/cli.js run \
  --url https://yourdocs.com/developers/developer-overview \
  --persona confused-beginner \
  --goal authenticate \
  --steps 10

# Test with casual browser (neutral persona)
node src/cli.js run \
  --url https://yourdocs.com/developers/developer-overview \
  --persona casual-browser \
  --goal authenticate \
  --steps 10

# Test with methodical learner
node src/cli.js run \
  --url https://yourdocs.com/developers/developer-overview \
  --persona methodical-learner \
  --goal authenticate \
  --steps 10

# Generate aggregate report
node src/cli.js report --dir journeys
```

### Sample output

```
Analyzing 3 journeys...

Success metrics:
   ✅ success: 2 (67%)
   ❌ stuck: 1 (33%)

Efficiency:
   Average steps: 4
   Total tokens used: ~3200
   Cost estimate: ~$0.0096

💡 Successful BUT Could Be Better:
   1 journey(s) found answers but content style wasn't ideal

1. [docs.stripe.com] API authentication uses API keys in headers
   Persona: confused-beginner (5 steps)
   Goal: Figure out how to authenticate API requests
   Content style: acceptable
   Gap: Needed step-by-step tutorial instead of API reference
   💡 Fix: Create "Getting Started with Authentication" tutorial
   Impact: high

🔴 Documentation Issues Found:

1. [docs.stripe.com] User got stuck in circular navigation loop
   Persona: desperate-debugger
   Goal: Fix a 401 Unauthorized error
   Outcome: loop-detected
   Missing: Troubleshooting page for authentication errors
   💡 Fix: Add "Common Authentication Errors" section with specific error codes
   💥 Impact: Developers can't resolve urgent production issues
```

## Token efficiency

The persona-specific content strategies optimize token usage:

**Confused Beginner** (Progressive):
- Preview: ~1500 chars (~375 tokens)
- Full load: ~5000 chars (~1250 tokens)
- Average per step: ~625 tokens (saves ~50% vs always-full)

**Efficient Developer** (Keyword Search):
- Targeted extraction: ~3000 chars (~750 tokens)
- Only relevant sections around keywords
- Saves tokens by skipping irrelevant content

**Methodical Learner** (Full-Always):
- Always: ~5000 chars (~1250 tokens)
- No optimization, but reflects actual reading behavior

For a 10-step journey:
- Beginner: ~6,250 tokens (~$0.0188)
- Expert: ~7,500 tokens (~$0.0225)
- Methodical: ~12,500 tokens (~$0.0375)

## Cost considerations

Approximate costs per test run (10 steps, using Claude Sonnet 4):
- Confused Beginner: ~$0.0188
- Efficient Developer: ~$0.0225
- Methodical Learner: ~$0.0375
- Success feedback generation: ~$0.0024
- Failure feedback generation: ~$0.003

For testing multiple personas across multiple sites:
- Single site, 4 personas, 3 goals each: ~$0.35
- 5 sites, 4 personas, 3 goals each: ~$1.75

## Tips for writing personas

Good personas have:
- Clear skill level and background
- Specific behaviors (what they prefer, what they avoid)
- Realistic patience levels
- Distinct decision-making patterns
- Matching behavior implementation in `personaBehaviors.js`

Bad personas:
- Too vague ("A developer")
- No clear preferences
- Unrealistic behaviors

## Tips for writing goals

Good goals:
- Specific and achievable
- Common user tasks
- Clear success criteria
- Realistic complexity level
- Use keywords that appear in documentation

Bad goals:
- Too vague ("Learn about the API")
- Too complex ("Build a complete application")
- Impossible to verify

## Limitations

- Only tests navigation and content, not interactive features
- Cannot test authenticated experiences
- Requires JavaScript-rendered content to be loaded
- API costs scale with number of tests
- Cannot evaluate visual design or accessibility
- Can struggle with navigation when elements are hidden in React components or require interaction to reveal
  - **Workaround:** Start tests from an appropriate landing page that skips problematic navigation for example:
    ```bash
    node src/cli.js run \
      --url https://docs.payabli.com/developers/developer-overview \
      --persona confused-beginner \
      --goal authenticate
    ```

## Project structure

```
.
├── src/
│   ├── cli.js                 # Main CLI application
│   ├── journey.js             # Journey execution logic
│   ├── decideNextStep.js      # Claude decision-making logic
│   ├── personaBehaviors.js    # Persona-specific behaviors and strategies
│   ├── feedbackGenerator.js   # Success and failure feedback
│   ├── contentExtractor.js    # Page content extraction
│   ├── linkExtractor.js       # Navigation link extraction
│   ├── inspector.js           # Site inspection utilities
│   ├── reporter.js            # Aggregate reporting
│   └── logger.js              # Logging utilities
├── config/
│   ├── personas.json          # User persona definitions
│   ├── goals.json             # User goal definitions
│   └── sites.json             # Site-specific configurations
├── examples/                  # Example outputs
├── journeys/                  # Test results (created automatically)
│   ├── journey-*.json
│   └── log-*.txt
├── package.json
├── .env.example
├── .gitignore
└── .env                       # API keys (not in repo)
```

## About this project

This is a research/demo project exploring AI-assisted documentation testing. It's shared as-is for educational and demonstration purposes.

If you find it useful, feel free to fork and adapt it for your needs!

## License

MIT
