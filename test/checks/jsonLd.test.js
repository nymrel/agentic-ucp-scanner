import test from 'node:test';
import assert from 'node:assert/strict';
import { checkJsonLd, extractJsonLdNodes } from '../../dist/checks/jsonLd.js';

test('JSON-LD - No script tags', () => {
  const result = checkJsonLd({ rawJsonLdStrings: [] });
  assert.equal(result.audit.validNodes, 0);
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks[0].status, 'FAIL');
});

test('JSON-LD - Comprehensive Organization & Product Offers', () => {
  const rawJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Apex Robotics',
        legalName: 'Apex Robotics LLC',
        parentOrganization: {
          '@type': 'Organization',
          name: 'Nymrel',
        },
      },
      {
        '@type': 'Product',
        name: 'Edge AI Kit',
        offers: {
          '@type': 'Offer',
          price: '299.00',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
  });

  const result = checkJsonLd({ rawJsonLdStrings: [rawJson] });
  assert.equal(result.audit.validNodes, 2);
  assert.equal(result.audit.hasParentOrg, true);
  assert.equal(result.audit.products.length, 1);
  assert.equal(result.audit.offers.length, 1);

  const syntaxCheck = result.checks.find((c) => c.id === 'jld-001');
  const orgCheck = result.checks.find((c) => c.id === 'jld-002');
  const offerCheck = result.checks.find((c) => c.id === 'jld-003');

  assert.ok(syntaxCheck && syntaxCheck.status === 'PASS');
  assert.ok(orgCheck && orgCheck.status === 'PASS');
  assert.ok(offerCheck && offerCheck.status === 'PASS');
});

test('JSON-LD - Rejects unrelated type names containing Schema.org terms', () => {
  const result = checkJsonLd({ rawJsonLdStrings: [JSON.stringify([
    { '@type': 'NotAnOrganization', name: 'Synthetic', parentOrganization: 'Synthetic parent' },
    { '@type': 'ProductReview', name: 'Synthetic review' },
    { '@type': 'https://example.com/Offer', price: '1', priceCurrency: 'USD' },
    { '@type': ['UnknownWebSiteType', 'CustomerService'], potentialAction: {} },
  ])] });
  assert.equal(result.audit.organizations.length, 0);
  assert.equal(result.audit.products.length, 0);
  assert.equal(result.audit.offers.length, 0);
  assert.equal(result.audit.websites.length, 0);
});

test('JSON-LD - Accepts exact terms and full Schema.org type IRIs', () => {
  const result = checkJsonLd({ rawJsonLdStrings: [JSON.stringify([
    { '@type': ['Unknown', 'https://schema.org/Organization'], name: 'Synthetic' },
    { '@type': 'http://schema.org/Product', name: 'Synthetic product' },
    { '@type': 'Offer', price: '1', priceCurrency: 'USD' },
    { '@type': 'WebSite' },
  ])] });
  assert.equal(result.audit.organizations.length, 1);
  assert.equal(result.audit.products.length, 1);
  assert.equal(result.audit.offers.length, 1);
  assert.equal(result.audit.websites.length, 1);
});
