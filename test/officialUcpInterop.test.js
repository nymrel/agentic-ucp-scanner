import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditLocalFixture, auditManifest } from '../dist/scanner.js';
import { checkUcpManifest } from '../dist/checks/ucpManifest.js';

const fixtureDirectory = new URL('./fixtures/official-ucp-store/', import.meta.url);
const fixtureText = readFileSync(new URL('.well-known/ucp.json', fixtureDirectory), 'utf8');
const fixture = () => JSON.parse(fixtureText);

test('Official UCP business profile is recognized and normalized', () => {
  const result = auditManifest(fixture());
  assert.equal(result.checks.find((c) => c.id === 'ucp-001').status, 'PASS');
  assert.equal(result.checks.find((c) => c.id === 'ucp-001').details.profile, 'official-ucp');
  assert.equal(result.ucpManifest?.ucpVersion, '2026-08-25');
  assert.equal(result.ucpManifest?.merchant.name, 'business.example.com');
  assert.equal(result.ucpManifest?.merchant.url, 'https://business.example.com');
  assert.equal(result.ucpManifest?.agentEndpoints.catalog, 'https://business.example.com/ucp/v1');
  assert.equal(result.ucpManifest?.agentEndpoints.checkout, 'https://business.example.com/ucp/v1');
  assert.deepEqual(result.ucpManifest?.paymentCapabilities.protocols, [
    'com.example.processor_tokenizer',
  ]);
  assert.equal(result.ucpManifest?.paymentCapabilities.x402Enabled, false);
  assert.equal(result.machinePayments.ucpCheckoutSupported, true);
});

test('Official UCP minimal empty registries still pass structure checks', () => {
  const result = checkUcpManifest({
    manifest: {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {},
        supported_versions: {
          '2026-01-11': 'https://business.example.com/.well-known/ucp/2026-01-11',
        },
      },
    },
    foundLocation: '/.well-known/ucp',
  });
  assert.ok(result.manifest);
  assert.equal(result.checks.find((c) => c.id === 'ucp-001').status, 'PASS');
  assert.equal(result.checks.find((c) => c.id === 'ucp-001').details.profile, 'official-ucp');
  assert.equal(result.manifest.merchant.name, 'UCP business profile');
  assert.deepEqual(result.manifest.agentEndpoints, {});
  assert.deepEqual(result.manifest.paymentCapabilities.protocols, []);
});

test('Official UCP checkout capability absence withholds checkout credit', () => {
  const manifest = fixture();
  delete manifest.ucp.capabilities;
  const result = auditManifest(manifest);
  assert.ok(result.ucpManifest);
  assert.equal(result.ucpManifest.agentEndpoints.catalog, 'https://business.example.com/ucp/v1');
  assert.equal(result.ucpManifest.agentEndpoints.checkout, undefined);
  assert.equal(result.machinePayments.ucpCheckoutSupported, false);
});

test('Official UCP malformed profiles fail closed with clear issues', () => {
  const cases = [
    { ucp: null },
    { ucp: { version: '1.0', services: {}, payment_handlers: {} } },
    { ucp: { version: '2026-13-40', services: {}, payment_handlers: {} } },
    { ucp: { version: '2026-08-25', payment_handlers: {} } },
    { ucp: { version: '2026-08-25', services: {}, payment_handlers: [] } },
    {
      ucp: {
        version: '2026-08-25',
        services: {
          shopping: [{ version: '2026-08-25', transport: 'rest', endpoint: 'https://business.example.com/ucp' }],
        },
        payment_handlers: {},
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {
          'dev.ucp.shopping': [
            { version: '2026-08-25', transport: 'rest' },
          ],
        },
        payment_handlers: {},
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {
          'dev.ucp.shopping': [
            {
              version: '2026-08-25',
              transport: 'rest',
              endpoint: 'http://business.example.com/ucp',
            },
          ],
        },
        payment_handlers: {},
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {
          'dev.ucp.shopping': [
            {
              version: '2026-08-25',
              transport: 'rest',
              endpoint: 'https://user:secret@business.example.com/ucp',
            },
          ],
        },
        payment_handlers: {},
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {
          'com.example.pay': [{ version: '2026-08-25' }],
        },
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {
          'com.example.pay': [{ id: 'pay', version: 'draft' }],
        },
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {},
        capabilities: {
          'dev.ucp.shopping.checkout': [{ version: '2026-08-25' }],
        },
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {},
        supported_versions: {
          draft: 'https://business.example.com/.well-known/ucp/old',
        },
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {
          'dev.ucp.shopping': [
            {
              version: '2026-08-25',
              transport: 'rest',
              endpoint: 'https://business.example.com/ucp',
              id: '',
              config: 'nope',
              spec: 'http://ucp.dev/spec',
            },
          ],
        },
        payment_handlers: {},
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {
          'com.example.pay': [
            {
              id: 'pay',
              version: '2026-08-25',
              config: [],
              available_instruments: 'card',
              schema: 'file:///tmp/schema.json',
            },
          ],
        },
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {},
        capabilities: {
          'dev.ucp.shopping.checkout': [
            {
              version: '2026-08-25',
              schema: 'https://ucp.dev/schemas/checkout.json',
              extends: ['not a name'],
              config: 'bad',
            },
          ],
        },
      },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {},
      },
      keys: { kid: 'not-an-array' },
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {},
        payment_handlers: {},
      },
      keys: ['not-a-jwk'],
    },
    {
      ucp: {
        version: '2026-08-25',
        services: {
          'dev.ucp.shopping': 'rest',
        },
        payment_handlers: {},
      },
    },
  ];

  for (const manifest of cases) {
    const result = checkUcpManifest({ manifest, foundLocation: '/.well-known/ucp' });
    assert.equal(result.manifest, null, JSON.stringify(manifest));
    assert.equal(result.checks[0].status, 'FAIL');
    assert.ok(Array.isArray(result.checks[0].details.issues));
    assert.ok(result.checks[0].details.issues.length > 0);
    assert.match(result.checks[0].message, /failed its supported input profile/i);
  }
});

test('Official UCP fixture is discovered from local .well-known/ucp.json', async () => {
  const result = await auditLocalFixture(fileURLToPath(fixtureDirectory));
  assert.equal(result.checks.find((c) => c.id === 'ucp-001').details.profile, 'official-ucp');
  assert.equal(result.ucpManifest?.merchant.name, 'business.example.com');
});

test('Existing open-ucp and scanner-project fixtures keep their profiles', () => {
  const openUcp = JSON.parse(
    readFileSync(new URL('./fixtures/open-ucp-store/.well-known/ucp.json', import.meta.url), 'utf8'),
  );
  const project = JSON.parse(
    readFileSync(new URL('./fixtures/perfect-agent-store/ucp.json', import.meta.url), 'utf8'),
  );
  assert.equal(auditManifest(openUcp).checks.find((c) => c.id === 'ucp-001').details.profile, 'open-ucp');
  assert.equal(auditManifest(project).checks.find((c) => c.id === 'ucp-001').details.profile, 'scanner-project');
  assert.equal(auditManifest(project).ucpManifest?.merchant.name, project.merchant.name);
});
