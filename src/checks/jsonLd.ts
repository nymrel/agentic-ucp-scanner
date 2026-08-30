/**
 * Check Module: JSON-LD Structured Data, Schema.org Graph & Entity Provenance
 */

import { CheckResult, JsonLdAudit, JsonLdNode } from '../types.js';

export interface JsonLdCheckInput {
  rawJsonLdStrings: string[];
}

export function extractJsonLdNodes(jsonStrings: string[]): {
  validNodes: JsonLdNode[];
  invalidCount: number;
  errors: string[];
} {
  const validNodes: JsonLdNode[] = [];
  const errors: string[] = [];
  let invalidCount = 0;

  for (const raw of jsonStrings) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            flattenAndCollect(item, validNodes);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        flattenAndCollect(parsed, validNodes);
      }
    } catch (err: unknown) {
      invalidCount++;
      errors.push(`JSON-LD parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { validNodes, invalidCount, errors };
}

function flattenAndCollect(obj: JsonLdNode, list: JsonLdNode[]): void {
  if (Array.isArray(obj['@graph'])) {
    for (const sub of obj['@graph']) {
      if (sub && typeof sub === 'object') {
        list.push(sub as JsonLdNode);
      }
    }
  } else {
    list.push(obj);
  }
}

function matchesType(node: JsonLdNode, targetType: string): boolean {
  const typeVal = node['@type'];
  if (typeof typeVal === 'string') {
    return typeVal.toLowerCase().includes(targetType.toLowerCase());
  }
  if (Array.isArray(typeVal)) {
    return typeVal.some((t) => typeof t === 'string' && t.toLowerCase().includes(targetType.toLowerCase()));
  }
  return false;
}

export function checkJsonLd(input: JsonLdCheckInput): {
  audit: JsonLdAudit;
  checks: CheckResult[];
} {
  const checks: CheckResult[] = [];
  const { rawJsonLdStrings } = input;
  const { validNodes, invalidCount, errors } = extractJsonLdNodes(rawJsonLdStrings);

  const orgs: JsonLdNode[] = [];
  const products: JsonLdNode[] = [];
  const offers: JsonLdNode[] = [];
  const websites: JsonLdNode[] = [];

  for (const node of validNodes) {
    if (
      matchesType(node, 'Organization') ||
      matchesType(node, 'Corporation') ||
      matchesType(node, 'LocalBusiness') ||
      matchesType(node, 'Store')
    ) {
      orgs.push(node);
    }
    if (matchesType(node, 'Product') || matchesType(node, 'Service') || matchesType(node, 'SoftwareApplication')) {
      products.push(node);
    }
    if (matchesType(node, 'Offer')) {
      offers.push(node);
    }
    if (matchesType(node, 'WebSite')) {
      websites.push(node);
    }

    // Check nested offers in Product
    if (node.offers) {
      if (Array.isArray(node.offers)) {
        for (const off of node.offers) {
          if (off && typeof off === 'object') offers.push(off as JsonLdNode);
        }
      } else if (typeof node.offers === 'object') {
        offers.push(node.offers as JsonLdNode);
      }
    }
  }

  // Check 1: JSON-LD Syntax & Script Presence
  const hasJsonLd = validNodes.length > 0;
  let syntaxScore = 0;
  if (hasJsonLd) {
    syntaxScore = invalidCount === 0 ? 6 : 4;
  }

  checks.push({
    id: 'jld-001',
    name: 'JSON-LD Structured Data Validity',
    dimension: 'entityGraph',
    status: syntaxScore === 6 ? 'PASS' : syntaxScore > 0 ? 'WARN' : 'FAIL',
    score: syntaxScore,
    maxScore: 6,
    message: hasJsonLd
      ? `Discovered ${validNodes.length} valid JSON-LD entity node(s). ${invalidCount > 0 ? `(${invalidCount} script(s) failed parsing)` : 'All scripts valid syntax.'}`
      : 'No valid JSON-LD structured data script found in HTML markup.',
    details: {
      validNodesCount: validNodes.length,
      invalidCount,
      errors,
    },
    remediation: !hasJsonLd
      ? 'Add `<script type="application/ld+json">` with Schema.org Organization and Product graphs to the page.'
      : undefined,
  });

  // Check 2: Entity Graph & Provenance Hierarchy (Organization / parentOrganization / Legal IDs)
  let entityScore = 0;
  let hasParentOrg = false;
  const parentChain: string[] = [];
  let hasLegalDetails = false;

  for (const org of orgs) {
    if (org.name) entityScore = Math.max(entityScore, 2);
    if (org.legalName || org.identifier || org.taxID || org.leiCode) {
      entityScore = Math.max(entityScore, 4);
      hasLegalDetails = true;
    }
    if (org.parentOrganization) {
      hasParentOrg = true;
      let parentName = '';
      if (typeof org.parentOrganization === 'string') {
        parentName = org.parentOrganization;
      } else if (typeof org.parentOrganization === 'object') {
        const pObj = org.parentOrganization as Record<string, unknown>;
        parentName = String(pObj.name || pObj.legalName || pObj['@id'] || 'Parent Entity');
      }
      parentChain.push(`${org.name || 'Entity'} -> ${parentName}`);
      entityScore = 6; // Full provenance
    }
    if (org.sameAs || org.contactPoint) {
      entityScore = Math.min(6, entityScore + 1);
    }
  }

  checks.push({
    id: 'jld-002',
    name: 'Entity Provenance & Machine Trust Graph',
    dimension: 'entityGraph',
    status: entityScore >= 5 ? 'PASS' : entityScore > 0 ? 'WARN' : 'FAIL',
    score: entityScore,
    maxScore: 6,
    message:
      entityScore >= 5
        ? `Rich entity graph detected with declared provenance fields: [${parentChain.join('; ') || orgs.map((o) => o.name).join(', ')}]`
        : orgs.length > 0
        ? `Basic Organization schema found (${orgs.map((o) => o.name).join(', ')}). Missing explicit parentOrganization hierarchy or legal identifier.`
        : 'Missing Organization / Store Schema.org node for entity identification.',
    details: {
      organizationsCount: orgs.length,
      hasParentOrg,
      parentOrgChain: parentChain,
      hasLegalEntityDetails: hasLegalDetails,
    },
    remediation:
      entityScore < 5
        ? 'Add `parentOrganization` (e.g. Nymrel -> JalenBuilds LLC), `legalName`, and `sameAs` links to your Schema.org Organization.'
        : undefined,
  });

  // Check 3: Products, Offers & Transparent Pricing
  let offerScore = 0;
  const hasProducts = products.length > 0;
  const hasOffers = offers.length > 0;

  if (hasProducts) offerScore += 3;
  if (hasOffers) {
    offerScore += 3;
    const hasPrice = offers.some((o) => o.price !== undefined);
    const hasCurrency = offers.some((o) => !!o.priceCurrency);
    const hasAvailability = offers.some((o) => !!o.availability);
    if (hasPrice && hasCurrency) offerScore += 1;
    if (hasAvailability) offerScore += 1;
  }

  checks.push({
    id: 'jld-003',
    name: 'Schema.org Offers & Pricing Transparency',
    dimension: 'intentAndOffers',
    status: offerScore >= 7 ? 'PASS' : offerScore > 0 ? 'WARN' : 'FAIL',
    score: offerScore,
    maxScore: 8,
    message:
      offerScore >= 7
        ? `Structured commerce offers detected (${products.length} product(s), ${offers.length} offer(s)) with machine-readable prices and availability.`
        : hasProducts || hasOffers
        ? `Partial product/offer schema found (${products.length} product(s), ${offers.length} offer(s)). Ensure price, priceCurrency (ISO 4217), and availability are explicit.`
        : 'No Schema.org Product, Offer, or Service structured data found for autonomous agent purchasing.',
    details: {
      productsCount: products.length,
      offersCount: offers.length,
    },
    remediation:
      offerScore < 7
        ? 'Declare Schema.org `Product` with `offers: { "@type": "Offer", "price": "...", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }`.'
        : undefined,
  });

  // Check 4: Intent, Actions & Merchant Policy
  let actionScore = 0;
  const hasSearchAction = websites.some((w) => !!w.potentialAction);
  const hasReturnPolicy = offers.some((o) => !!o.hasMerchantReturnPolicy || !!o.shippingDetails);

  if (hasSearchAction) actionScore += 2;
  if (hasReturnPolicy) actionScore += 2;
  if (actionScore === 0 && (hasProducts || hasOffers)) actionScore = 1;

  checks.push({
    id: 'jld-004',
    name: 'Machine Actions & Merchant Policy Terms',
    dimension: 'intentAndOffers',
    status: actionScore >= 3 ? 'PASS' : actionScore > 0 ? 'WARN' : 'INFO',
    score: actionScore,
    maxScore: 4,
    message:
      actionScore >= 3
        ? 'Machine-executable actions (SearchAction / OrderAction) and clear merchant return/shipping policies defined.'
        : actionScore > 0
        ? 'Basic actions or commerce nodes found, but missing formal merchant return policies or search action schemas.'
        : 'No potential actions (SearchAction / OrderAction) or merchant policies declared.',
    details: {
      hasSearchAction,
      hasReturnPolicy,
    },
    remediation:
      actionScore < 3
        ? 'Add `potentialAction: SearchAction` to WebSite and `hasMerchantReturnPolicy` to Offers in JSON-LD.'
        : undefined,
  });

  const audit: JsonLdAudit = {
    scriptCount: rawJsonLdStrings.length,
    validNodes: validNodes.length,
    invalidNodes: invalidCount,
    rawNodes: validNodes,
    organizations: orgs,
    products,
    offers,
    websites,
    hasParentOrg,
    parentOrgChain: parentChain,
    hasLegalEntityDetails: hasLegalDetails,
    issues: errors,
  };

  return { audit, checks };
}
