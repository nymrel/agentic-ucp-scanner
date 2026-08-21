/**
 * Check Module: robots.txt AI Agent and Search Bot Access Audit
 */

import { BotAccessRule, CheckResult, RobotsTxtAudit } from '../types.js';

export interface RobotsTxtCheckInput {
  rawContent: string | null | undefined;
  url?: string;
}

const AI_SEARCH_BOTS = [
  'OAI-SearchBot',
  'PerplexityBot',
  'ClaudeBot',
  'Applebot-Extended',
  'Bingbot',
];

const AI_TRAINING_BOTS = [
  'GPTBot',
  'Google-Extended',
  'AnthropicAI',
  'Meta-ExternalAgent',
  'Amazonbot',
  'Bytespider',
  'CCBot',
];

export function parseRobotsTxt(content: string): {
  rules: Record<string, { allow: string[]; disallow: string[] }>;
  sitemaps: string[];
} {
  const rules: Record<string, { allow: string[]; disallow: string[] }> = {};
  const sitemaps: string[] = [];

  const lines = content.split(/\r?\n/);
  let currentAgents: string[] = [];

  for (let line of lines) {
    line = line.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'user-agent') {
      currentAgents = [value];
      for (const agent of currentAgents) {
        if (!rules[agent]) {
          rules[agent] = { allow: [], disallow: [] };
        }
      }
    } else if (key === 'sitemap') {
      if (value && !sitemaps.includes(value)) {
        sitemaps.push(value);
      }
    } else if (key === 'disallow' || key === 'allow') {
      if (currentAgents.length === 0) {
        currentAgents = ['*'];
        if (!rules['*']) {
          rules['*'] = { allow: [], disallow: [] };
        }
      }
      for (const agent of currentAgents) {
        if (key === 'disallow') {
          rules[agent].disallow.push(value);
        } else {
          rules[agent].allow.push(value);
        }
      }
    }
  }

  return { rules, sitemaps };
}

export function evaluateBotAccess(
  botName: string,
  rules: Record<string, { allow: string[]; disallow: string[] }>
): BotAccessRule {
  // Check exact agent match first, then fallback to '*'
  const agentKey = Object.keys(rules).find((k) => k.toLowerCase() === botName.toLowerCase());
  const agentRule = agentKey ? rules[agentKey] : rules['*'];

  if (!agentRule) {
    return { agent: botName, allowed: true, directive: 'Default Allow (No explicit rule)' };
  }

  // Check if root '/' is disallowed
  const disallowsRoot = agentRule.disallow.some((p) => p === '/' || p === '/*');
  const allowsRoot = agentRule.allow.some((p) => p === '/' || p === '/*');

  if (disallowsRoot && !allowsRoot) {
    return { agent: botName, allowed: false, directive: `Disallow: / (${agentKey || '*'})` };
  }

  return {
    agent: botName,
    allowed: true,
    directive: agentKey ? `Explicit ${agentKey} rules` : 'Inherited from User-agent: *',
  };
}

export function checkRobotsTxt(input: RobotsTxtCheckInput): {
  audit: RobotsTxtAudit;
  checks: CheckResult[];
} {
  const checks: CheckResult[] = [];
  const { rawContent, url } = input;

  if (!rawContent || typeof rawContent !== 'string') {
    const audit: RobotsTxtAudit = {
      exists: false,
      url,
      sitemaps: [],
      bots: {},
      hasBlanketDisallow: false,
      aiSearchBotsAllowed: true, // Absence of robots.txt defaults to allowed in standard web
      aiTrainingBotsAllowed: true,
      issues: ['No robots.txt found. Defaulting to full permissive access.'],
    };

    checks.push({
      id: 'rob-001',
      name: 'robots.txt Presence & Clarity',
      dimension: 'aiCrawlerAccess',
      status: 'WARN',
      score: 2,
      maxScore: 4,
      message: 'No robots.txt discovered at standard root path. Defaulting to permissive access.',
      remediation:
        'Add a clear `robots.txt` explicitly distinguishing between AI search agents (OAI-SearchBot) and training bots.',
    });

    return { audit, checks };
  }

  const { rules, sitemaps } = parseRobotsTxt(rawContent);
  const botMap: Record<string, BotAccessRule> = {};

  const allBots = [...AI_SEARCH_BOTS, ...AI_TRAINING_BOTS];
  for (const bot of allBots) {
    botMap[bot] = evaluateBotAccess(bot, rules);
  }

  const starRule = rules['*'];
  const hasBlanketDisallow = !!starRule && starRule.disallow.some((p) => p === '/' || p === '/*');

  const searchBotRules = AI_SEARCH_BOTS.map((b) => botMap[b]);
  const allowedSearchBots = searchBotRules.filter((r) => r.allowed);
  const aiSearchBotsAllowed = allowedSearchBots.length >= Math.ceil(AI_SEARCH_BOTS.length / 2);

  const trainingBotRules = AI_TRAINING_BOTS.map((b) => botMap[b]);
  const allowedTrainingBots = trainingBotRules.filter((r) => r.allowed);
  const aiTrainingBotsAllowed = allowedTrainingBots.length > 0;

  const issues: string[] = [];

  // Check 1: Presence
  checks.push({
    id: 'rob-001',
    name: 'robots.txt Presence & Structure',
    dimension: 'aiCrawlerAccess',
    status: 'PASS',
    score: 4,
    maxScore: 4,
    message: `robots.txt found with ${Object.keys(rules).length} user-agent rule blocks defined.`,
    details: { userAgentsCount: Object.keys(rules).length },
  });

  // Check 2: AI Search Bot Access (Crucial for Agentic Commerce Discovery)
  let searchBotScore = 0;
  if (aiSearchBotsAllowed && !hasBlanketDisallow) {
    searchBotScore = 8;
  } else if (aiSearchBotsAllowed && hasBlanketDisallow) {
    // Explicit override for search bots
    searchBotScore = 7;
  } else if (!aiSearchBotsAllowed) {
    searchBotScore = 0;
    issues.push('AI Search bots (e.g. OAI-SearchBot, PerplexityBot) are blocked from discovering catalog.');
  }

  checks.push({
    id: 'rob-002',
    name: 'AI Search Bot Discoverability',
    dimension: 'aiCrawlerAccess',
    status: searchBotScore >= 7 ? 'PASS' : searchBotScore > 0 ? 'WARN' : 'FAIL',
    score: searchBotScore,
    maxScore: 8,
    message:
      searchBotScore >= 7
        ? `AI search agents (OAI-SearchBot, PerplexityBot, ClaudeBot) are allowed access.`
        : `AI search agents are blocked or severely restricted by robots.txt directives.`,
    details: {
      allowedBots: allowedSearchBots.map((b) => b.agent),
      blockedBots: searchBotRules.filter((b) => !b.allowed).map((b) => b.agent),
    },
    remediation:
      searchBotScore < 7
        ? 'Allow `User-agent: OAI-SearchBot` and `User-agent: PerplexityBot` in robots.txt so autonomous agents can discover your offers.'
        : undefined,
  });

  // Check 3: Intelligent Bot Policy (Distinguishing Search vs Scrapers)
  let policyScore = 0;
  const hasSpecificAiRules = Object.keys(rules).some((k) =>
    /oai-searchbot|gptbot|claudebot|perplexitybot|anthropic/i.test(k)
  );

  if (hasSpecificAiRules) {
    policyScore = 4;
  } else if (!hasBlanketDisallow) {
    policyScore = 3; // Permissive default
  } else {
    policyScore = 0;
    issues.push('Blanket User-agent: * Disallow: / blocks all AI commerce discovery indiscriminately.');
  }

  checks.push({
    id: 'rob-003',
    name: 'Granular AI Crawler Policy',
    dimension: 'aiCrawlerAccess',
    status: policyScore >= 3 ? 'PASS' : 'FAIL',
    score: policyScore,
    maxScore: 4,
    message:
      policyScore === 4
        ? 'Granular AI agent directives detected (differentiates search indexing from training scraping).'
        : policyScore === 3
        ? 'Default permissive crawler policy active (no hostile blanket blocks).'
        : 'Indiscriminate blanket crawler block detected without AI agent exceptions.',
    details: {
      hasSpecificAiRules,
      hasBlanketDisallow,
    },
    remediation:
      policyScore < 3
        ? 'Replace blanket Disallow: / with granular rules permitting commercial AI agents while restricting scrapers as desired.'
        : undefined,
  });

  // Check 4: Sitemap Declarations
  const sitemapScore = sitemaps.length > 0 ? 4 : 0;
  if (sitemaps.length === 0) {
    issues.push('No Sitemap directive declared in robots.txt.');
  }

  checks.push({
    id: 'rob-004',
    name: 'Sitemap Discovery Directive',
    dimension: 'discovery',
    status: sitemapScore === 4 ? 'PASS' : 'WARN',
    score: sitemapScore,
    maxScore: 4,
    message:
      sitemapScore === 4
        ? `Sitemap declared in robots.txt: ${sitemaps.join(', ')}`
        : 'No Sitemap directive declared in robots.txt.',
    details: { sitemaps },
    remediation: sitemapScore === 0 ? 'Add `Sitemap: https://yourdomain.com/sitemap.xml` to robots.txt.' : undefined,
  });

  const audit: RobotsTxtAudit = {
    exists: true,
    url,
    rawContent,
    sitemaps,
    bots: botMap,
    hasBlanketDisallow,
    aiSearchBotsAllowed,
    aiTrainingBotsAllowed,
    issues,
  };

  return { audit, checks };
}
