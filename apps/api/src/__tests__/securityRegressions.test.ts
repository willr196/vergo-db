import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Duplex } from 'node:stream';

function setRequiredEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/vergo_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-change';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-please-change';
  process.env.WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:8080';
}

setRequiredEnv();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signAccessToken } = require('../utils/jwt');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mobileClient = require('../routes/mobileClient').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mobileMarketplace = require('../routes/mobileMarketplace').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const quotes = require('../routes/quotes').default;

class MockSocket extends Duplex {
  public chunks: Buffer[] = [];
  public remoteAddress = '127.0.0.1';
  public encrypted = false;

  _read() {}

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback(null);
  }
}

async function inject(app: any, opts: { method: string; url: string; headers?: Record<string, string>; body?: string }) {
  const socket = new MockSocket();
  const req = new http.IncomingMessage(socket as any);
  req.method = opts.method;
  req.url = opts.url;
  req.headers = {};
  for (const [k, v] of Object.entries(opts.headers || {})) {
    req.headers[k.toLowerCase()] = v;
  }

  const body = Buffer.from(opts.body || '', 'utf8');
  if (body.length && !req.headers['content-length']) {
    req.headers['content-length'] = String(body.length);
  }

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as any);

  const result = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    res.on('finish', () => {
      const raw = Buffer.concat(socket.chunks).toString('utf8');
      const parsedBody = raw.includes('\r\n\r\n') ? raw.split('\r\n\r\n').slice(1).join('\r\n\r\n') : raw;
      resolve({ statusCode: res.statusCode, body: parsedBody });
      socket.destroy();
    });
    res.on('error', reject);
    app.handle(req, res);
    process.nextTick(() => {
      if (body.length) {
        req.emit('data', body);
      }
      req.emit('end');
    });
  });

  return result;
}

test('client mobile jobs do not fall back to company-name ownership when duplicates exist', async () => {
  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.client.findUnique;
  const originalCount = prismaAny.client.count;
  const originalFindFirst = prismaAny.job.findFirst;

  const token = signAccessToken({ sub: 'client-b', type: 'client', email: 'client-b@example.com' });
  let observedWhere: any = null;

  prismaAny.client.findUnique = async ({ where }: any) => {
    assert.equal(where.id, 'client-b');
    return { id: 'client-b', companyName: 'Acme Events' };
  };
  prismaAny.client.count = async ({ where }: any) => {
    assert.equal(where.companyName, 'Acme Events');
    return 2;
  };
  prismaAny.job.findFirst = async (args: any) => {
    observedWhere = args.where;
    return null;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/client/mobile', mobileClient);

  try {
    const response = await inject(app, {
      method: 'GET',
      url: '/api/v1/client/mobile/jobs/job-1',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(observedWhere, { id: 'job-1', clientId: 'client-b' });
  } finally {
    prismaAny.client.findUnique = originalFindUnique;
    prismaAny.client.count = originalCount;
    prismaAny.job.findFirst = originalFindFirst;
  }
});

test('public quote submissions ignore spoofed client identifiers and do not create quote records', async () => {
  const prismaAny = prisma as any;
  const originalCreate = prismaAny.quoteRequest.create;

  let createCalled = false;
  prismaAny.quoteRequest.create = async () => {
    createCalled = true;
    return { id: 'quote-1' };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/quotes', quotes);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/quotes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Mallory',
        email: 'victim@example.com',
        eventType: 'Corporate Event',
        staffNeeded: 5,
        clientId: 'client-victim',
      }),
    });

    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(body.quoteId, null);
    assert.equal(createCalled, false);
  } finally {
    prismaAny.quoteRequest.create = originalCreate;
  }
});

test('mobile marketplace masks staff identity, hides internal pay rates, and uses effective tier pricing', async () => {
  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.client.findUnique;
  const originalFindManyUsers = prismaAny.user.findMany;
  const originalCountUsers = prismaAny.user.count;
  const originalFindManyPricing = prismaAny.pricingTier.findMany;

  const token = signAccessToken({ sub: 'client-premium', type: 'client', email: 'premium@example.com' });
  let observedPricingTier: string | null = null;

  prismaAny.client.findUnique = async ({ where }: any) => {
    assert.equal(where.id, 'client-premium');
    return {
      id: 'client-premium',
      status: 'APPROVED',
      subscriptionTier: 'PREMIUM',
      subscriptionStatus: 'PAUSED',
      subscriptionStartedAt: null,
      subscriptionExpiresAt: null,
    };
  };
  prismaAny.user.findMany = async () => ([
    {
      id: 'staff-1',
      firstName: 'Alice',
      lastName: 'Smith',
      staffTier: 'STANDARD',
      staffBio: 'Experienced event staff',
      staffAvatar: null,
      staffAvailable: true,
      staffRating: 4.8,
      staffReviewCount: 12,
      staffHighlights: 'Festivals, launches',
    },
  ]);
  prismaAny.user.count = async () => 1;
  prismaAny.pricingTier.findMany = async ({ where }: any) => {
    observedPricingTier = where.clientTier;
    return [
      {
        staffTier: 'STANDARD',
        hourlyRate: 27,
        isBookable: true,
      },
    ];
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/client/mobile', mobileMarketplace);

  try {
    const response = await inject(app, {
      method: 'GET',
      url: '/api/v1/client/mobile/marketplace/staff',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(observedPricingTier, 'STANDARD');
    assert.equal(body.clientTier, 'STANDARD');
    assert.equal(body.subscriptionTier, 'PREMIUM');
    assert.equal(body.premiumAccessActive, false);
    assert.equal(body.staff[0].fullName, 'Alice S.');
    assert.equal(body.staff[0].lastName, 'S.');
    assert.equal('staffPayRate' in body.staff[0], false);
  } finally {
    prismaAny.client.findUnique = originalFindUnique;
    prismaAny.user.findMany = originalFindManyUsers;
    prismaAny.user.count = originalCountUsers;
    prismaAny.pricingTier.findMany = originalFindManyPricing;
  }
});
