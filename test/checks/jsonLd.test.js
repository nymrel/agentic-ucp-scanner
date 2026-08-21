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
