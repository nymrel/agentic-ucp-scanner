/**
 * JSON Reporter for agentic-ucp-scanner
 * Formats audit results into structured JSON for machine ingestion and programmatic pipelines.
 */

import { AuditResult } from '../types.js';

export function formatJsonReport(result: AuditResult, pretty: boolean = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
