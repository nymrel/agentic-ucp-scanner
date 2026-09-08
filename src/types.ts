/**
 * Types & Interfaces for agentic-ucp-scanner
 * Universal Commerce Protocol & AI Agent Readiness Audit Engine
 */

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export type DimensionKey =
  | 'discovery'
  | 'entityGraph'
  | 'intentAndOffers'
  | 'machinePayments'
  | 'aiCrawlerAccess';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CheckResult {
  id: string;
  name: string;
  dimension: DimensionKey;
  status: CheckStatus;
  score: number;
  maxScore: number;
  message: string;
  details?: Record<string, unknown>;
  remediation?: string;
}

export interface DimensionScore {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  checksCount: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
}

export interface AuditScore {
  totalScore: number;
  maxScore: number;
  grade: Grade;
  machineTrustIndex: number; // 0.00 to 1.00
  summary: string;
  dimensions: Record<DimensionKey, DimensionScore>;
  timestamp: string;
}

export interface UCPMerchant {
  name: string;
  legalName?: string;
  entityId?: string;
  parentEntity?: string;
  contactEmail?: string;
  url?: string;
}

export interface UCPAgentEndpoints {
  catalog?: string;
  search?: string;
  quote?: string;
  order?: string;
  checkout?: string;
  webhook?: string;
  status?: string;
}

export interface UCPPaymentCapabilities {
  protocols: string[];
  supportedTokens?: string[];
  escrow?: boolean;
  x402Enabled?: boolean;
  settlementSpeed?: string;
}

export interface UCPAuthentication {
  type: 'token' | 'signature' | 'oauth2' | 'x402_header' | 'none' | string;
  algorithm?: string;
  publicKeyUrl?: string;
  details?: Record<string, unknown>;
}

export interface UCPManifest {
  ucpVersion: string;
  merchant: UCPMerchant;
  agentEndpoints: UCPAgentEndpoints;
  paymentCapabilities: UCPPaymentCapabilities;
  authentication?: UCPAuthentication;
  catalog?: string | Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface BotAccessRule {
  agent: string;
  allowed: boolean;
  directive?: string;
}

export interface RobotsTxtAudit {
  exists: boolean;
  url?: string;
  rawContent?: string;
  sitemaps: string[];
  bots: Record<string, BotAccessRule>;
  hasBlanketDisallow: boolean;
  aiSearchBotsAllowed: boolean;
  aiTrainingBotsAllowed: boolean;
  issues: string[];
}

export interface LlmsTxtAudit {
  exists: boolean;
  url?: string;
  rawContent?: string;
  title?: string;
  summary?: string;
  hasFullVersion: boolean;
  fullVersionUrl?: string;
  sectionsCount: number;
  offersCount: number;
  sizeBytes: number;
  issues: string[];
}

export interface JsonLdNode {
  '@context'?: string;
  '@type'?: string | string[];
  '@id'?: string;
  name?: string;
  legalName?: string;
  parentOrganization?: string | Record<string, unknown>;
  brand?: string | Record<string, unknown>;
  founder?: string | Record<string, unknown>;
  url?: string;
  offers?: unknown;
  price?: number | string;
  priceCurrency?: string;
  availability?: string;
  [key: string]: unknown;
}

export interface JsonLdAudit {
  scriptCount: number;
  validNodes: number;
  invalidNodes: number;
  rawNodes: JsonLdNode[];
  organizations: JsonLdNode[];
  products: JsonLdNode[];
  offers: JsonLdNode[];
  websites: JsonLdNode[];
  hasParentOrg: boolean;
  parentOrgChain: string[];
  hasLegalEntityDetails: boolean;
  issues: string[];
}

export interface MachinePaymentsAudit {
  x402Supported: boolean;
  ucpCheckoutSupported: boolean;
  ap2Supported: boolean;
  acpSupported: boolean;
  stripePaymentLinks: string[];
  cryptoPaymentRails: string[];
  machineEndpointsFound: string[];
  issues: string[];
}

export interface AuditOptions {
  timeoutMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  maxResponseBytes?: number;
  maxRedirects?: number;
}

export interface AuditResult {
  target: string;
  isLocalFixture: boolean;
  auditedAt: string;
  responseTimeMs: number;
  httpStatus?: number;
  score: AuditScore;
  checks: CheckResult[];
  ucpManifest?: UCPManifest | null;
  robotsTxt?: RobotsTxtAudit;
  llmsTxt?: LlmsTxtAudit;
  jsonLd?: JsonLdAudit;
  machinePayments?: MachinePaymentsAudit;
  rawHtml?: string;
  error?: string;
}

export type ReporterFormat = 'terminal' | 'json' | 'markdown';

export interface CliOptions {
  target?: string;
  format: ReporterFormat;
  output?: string;
  minScore?: number;
  mock?: 'perfect' | 'partial' | 'hostile' | string;
  timeout: number;
  maxResponseBytes: number;
  maxRedirects: number;
  noColor: boolean;
  verbose: boolean;
}
