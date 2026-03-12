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

test('cancelScheduledEmail removes queue job and updates DB status', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { cancelScheduledEmail } = require('../services/email/scheduler');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { emailQueue } = require('../services/email/queue');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');

  const emailQueueAny = emailQueue as any;
  const prismaAny = prisma as any;

  const originalCancelJob = emailQueueAny.cancelJob;
  const originalScheduledUpdate = prismaAny.scheduledEmail.update;

  let updateCalled = false;

  emailQueueAny.cancelJob = async (jobId: string) => {
    assert.equal(jobId, 'job-123');
    return true;
  };

  prismaAny.scheduledEmail.update = async (args: any) => {
    updateCalled = true;
    assert.equal(args.where.jobId, 'job-123');
    assert.equal(args.data.status, 'CANCELLED');
    return { id: 'scheduled-id', jobId: 'job-123', status: 'CANCELLED' };
  };

  try {
    const ok = await cancelScheduledEmail('job-123');
    assert.equal(ok, true);
    assert.equal(updateCalled, true);
  } finally {
    emailQueueAny.cancelJob = originalCancelJob;
    prismaAny.scheduledEmail.update = originalScheduledUpdate;
  }
});

test('user mobile refresh rotates token and revokes previous token', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { signRefreshToken, verifyRefreshToken, hashToken } = require('../utils/jwt');

  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.refreshToken.findUnique;
  const originalUpdate = prismaAny.refreshToken.update;
  const originalCreate = prismaAny.refreshToken.create;

  const userId = 'user_123';
  const email = 'user@example.com';
  const oldRefreshToken = signRefreshToken({ sub: userId, type: 'user', email });
  const oldHash = hashToken(oldRefreshToken);

  const revokedHashes: string[] = [];
  const createdHashes: string[] = [];

  prismaAny.refreshToken.findUnique = async (args: any) => {
    if (args?.where?.tokenHash !== oldHash) return null;
    return {
      id: 'token-old',
      tokenHash: oldHash,
      userId,
      clientId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
  };

  prismaAny.refreshToken.update = async (args: any) => {
    revokedHashes.push(args.where.tokenHash);
    return { id: 'token-old', ...args.data, tokenHash: args.where.tokenHash };
  };

  prismaAny.refreshToken.create = async (args: any) => {
    createdHashes.push(args.data.tokenHash);
    return { id: 'token-new', ...args.data };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/user', userAuth);
  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/user/mobile/refresh',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;

    assert.equal(body.ok, true);
    assert.ok(typeof body.token === 'string' && body.token.length > 0);
    assert.ok(typeof body.refreshToken === 'string' && body.refreshToken.length > 0);

    assert.deepEqual(revokedHashes, [oldHash]);
    assert.equal(createdHashes.length, 1);
    assert.equal(createdHashes[0], hashToken(body.refreshToken));

    const newPayload = verifyRefreshToken(body.refreshToken);
    assert.equal(newPayload.sub, userId);
    assert.equal(newPayload.type, 'user');
    assert.equal(newPayload.tokenType, 'refresh');
  } finally {
    prismaAny.refreshToken.findUnique = originalFindUnique;
    prismaAny.refreshToken.update = originalUpdate;
    prismaAny.refreshToken.create = originalCreate;
  }
});

test('user mobile refresh detects token reuse and revokes all active tokens', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { signRefreshToken, hashToken } = require('../utils/jwt');

  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.refreshToken.findUnique;
  const originalUpdateMany = prismaAny.refreshToken.updateMany;
  const originalUpdate = prismaAny.refreshToken.update;
  const originalCreate = prismaAny.refreshToken.create;

  const userId = 'user_reuse_123';
  const email = 'reuse-user@example.com';
  const reusedRefreshToken = signRefreshToken({ sub: userId, type: 'user', email });
  const reusedHash = hashToken(reusedRefreshToken);

  let revokeAllCalled = false;
  let rotateUpdateCalled = false;
  let rotateCreateCalled = false;

  prismaAny.refreshToken.findUnique = async (args: any) => {
    if (args?.where?.tokenHash !== reusedHash) return null;
    return {
      id: 'token-reused',
      tokenHash: reusedHash,
      userId,
      clientId: null,
      revokedAt: new Date(Date.now() - 10_000), // already revoked
      expiresAt: new Date(Date.now() + 60_000),
    };
  };

  prismaAny.refreshToken.updateMany = async (args: any) => {
    revokeAllCalled = true;
    assert.equal(args.where.userId, userId);
    assert.equal(args.where.revokedAt, null);
    assert.ok(args.data.revokedAt instanceof Date);
    return { count: 3 };
  };

  prismaAny.refreshToken.update = async () => {
    rotateUpdateCalled = true;
    return {};
  };

  prismaAny.refreshToken.create = async () => {
    rotateCreateCalled = true;
    return {};
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/user', userAuth);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/user/mobile/refresh',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: reusedRefreshToken }),
    });

    assert.equal(response.statusCode, 401);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, false);
    assert.equal(body.code, 'REFRESH_TOKEN_REUSE_DETECTED');
    assert.equal(body.forceLogout, true);
    assert.equal(body.reauthRequired, true);
    assert.equal(revokeAllCalled, true);
    assert.equal(rotateUpdateCalled, false);
    assert.equal(rotateCreateCalled, false);
  } finally {
    prismaAny.refreshToken.findUnique = originalFindUnique;
    prismaAny.refreshToken.updateMany = originalUpdateMany;
    prismaAny.refreshToken.update = originalUpdate;
    prismaAny.refreshToken.create = originalCreate;
  }
});

test('user registration does not expose verification links unless explicitly enabled', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { env } = require('../env');

  const prismaAny = prisma as any;
  const envAny = env as any;
  const originalFindUnique = prismaAny.user.findUnique;
  const originalCreate = prismaAny.user.create;
  const originalResendConfigured = envAny.resendConfigured;
  const originalExposeDevVerificationLinks = envAny.exposeDevVerificationLinks;

  prismaAny.user.findUnique = async () => null;
  prismaAny.user.create = async (args: any) => ({
    id: 'user-register-1',
    email: args.data.email,
    firstName: args.data.firstName,
  });
  envAny.resendConfigured = false;
  envAny.exposeDevVerificationLinks = false;

  const app = express();
  app.use(express.json());
  app.use('/api/v1/user', userAuth);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/user/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Casey',
        lastName: 'Tester',
        email: 'casey@example.com',
        password: 'correct horse battery staple',
      }),
    });

    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, true);
    assert.equal(body.emailDelivery, 'unavailable');
    assert.equal('verificationUrl' in body, false);
  } finally {
    prismaAny.user.findUnique = originalFindUnique;
    prismaAny.user.create = originalCreate;
    envAny.resendConfigured = originalResendConfigured;
    envAny.exposeDevVerificationLinks = originalExposeDevVerificationLinks;
  }
});

test('client mobile refresh detects token reuse and revokes all active tokens', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clientAuth = require('../routes/clientAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { signRefreshToken, hashToken } = require('../utils/jwt');

  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.refreshToken.findUnique;
  const originalUpdateMany = prismaAny.refreshToken.updateMany;
  const originalUpdate = prismaAny.refreshToken.update;
  const originalCreate = prismaAny.refreshToken.create;

  const clientId = 'client_reuse_123';
  const email = 'reuse-client@example.com';
  const reusedRefreshToken = signRefreshToken({ sub: clientId, type: 'client', email });
  const reusedHash = hashToken(reusedRefreshToken);

  let revokeAllCalled = false;
  let rotateUpdateCalled = false;
  let rotateCreateCalled = false;

  prismaAny.refreshToken.findUnique = async (args: any) => {
    if (args?.where?.tokenHash !== reusedHash) return null;
    return {
      id: 'token-reused-client',
      tokenHash: reusedHash,
      userId: null,
      clientId,
      revokedAt: new Date(Date.now() - 10_000), // already revoked
      expiresAt: new Date(Date.now() + 60_000),
    };
  };

  prismaAny.refreshToken.updateMany = async (args: any) => {
    revokeAllCalled = true;
    assert.equal(args.where.clientId, clientId);
    assert.equal(args.where.revokedAt, null);
    assert.ok(args.data.revokedAt instanceof Date);
    return { count: 2 };
  };

  prismaAny.refreshToken.update = async () => {
    rotateUpdateCalled = true;
    return {};
  };

  prismaAny.refreshToken.create = async () => {
    rotateCreateCalled = true;
    return {};
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/client', clientAuth);

  try {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/v1/client/mobile/refresh',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: reusedRefreshToken }),
    });

    assert.equal(response.statusCode, 401);
    const body = JSON.parse(response.body || '{}') as any;
    assert.equal(body.ok, false);
    assert.equal(body.code, 'REFRESH_TOKEN_REUSE_DETECTED');
    assert.equal(body.forceLogout, true);
    assert.equal(body.reauthRequired, true);
    assert.equal(revokeAllCalled, true);
    assert.equal(rotateUpdateCalled, false);
    assert.equal(rotateCreateCalled, false);
  } finally {
    prismaAny.refreshToken.findUnique = originalFindUnique;
    prismaAny.refreshToken.updateMany = originalUpdateMany;
    prismaAny.refreshToken.update = originalUpdate;
    prismaAny.refreshToken.create = originalCreate;
  }
});

test('user profile update links applicant data and returns web profile payload', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const userAuth = require('../routes/userAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');

  const prismaAny = prisma as any;
  const originalTransaction = prismaAny.$transaction;

  const userUpdateCalls: any[] = [];
  let applicantUpsertCalled = false;
  let findUniqueCount = 0;

  prismaAny.$transaction = async (callback: any) => {
    const tx = {
      user: {
        findUnique: async () => {
          findUniqueCount += 1;

          if (findUniqueCount === 1) {
            return {
              id: 'user-profile-1',
              email: 'alice@example.com',
              firstName: 'Alice',
              lastName: 'Brown',
              phone: null,
              applicantId: null,
            };
          }

          return {
            id: 'user-profile-1',
            email: 'alice@example.com',
            firstName: 'Alicia',
            lastName: 'Brown',
            phone: '07123456789',
            applicantId: 'applicant-1',
            staffAvatar: null,
            staffBio: 'Five years across premium events',
            applicant: {
              id: 'applicant-1',
              firstName: 'Alicia',
              lastName: 'Brown',
              phone: '07123456789',
              dateOfBirth: new Date('1994-03-20T00:00:00.000Z'),
              postcode: 'E1 6AN',
              preferredJobTypes: 'Corporate Events,Film & TV',
              bio: 'Five years across premium events',
              yearsExperience: 5,
              applications: [
                {
                  roles: [
                    { role: { name: 'Bartender' } },
                    { role: { name: 'Event Host' } },
                  ],
                },
              ],
            },
          };
        },
        update: async (args: any) => {
          userUpdateCalls.push(args);
          return { id: 'user-profile-1', ...args.data };
        },
      },
      applicant: {
        upsert: async (args: any) => {
          applicantUpsertCalled = true;
          assert.equal(args.where.email, 'alice@example.com');
          assert.equal(args.create.postcode, 'E1 6AN');
          assert.equal(args.create.preferredJobTypes, 'Corporate Events,Film & TV');
          return { id: 'applicant-1' };
        },
      },
    };

    return callback(tx);
  };

  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = {
      isUser: true,
      userId: 'user-profile-1',
      userLoginTime: Date.now(),
      userLastActivity: Date.now(),
      destroy: () => {},
    };
    next();
  });
  app.use('/api/v1/user', userAuth);

  try {
    const response = await inject(app, {
      method: 'PUT',
      url: '/api/v1/user/profile',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Alicia',
        phone: '07123456789',
        postcode: 'E1 6AN',
        dateOfBirth: '1994-03-20',
        preferredJobTypes: ['Corporate Events', 'Film & TV'],
        experienceSummary: 'Five years across premium events',
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;

    assert.equal(body.ok, true);
    assert.equal(body.data.firstName, 'Alicia');
    assert.equal(body.data.postcode, 'E1 6AN');
    assert.equal(body.data.dateOfBirth, '1994-03-20');
    assert.deepEqual(body.data.preferredJobTypes, ['Corporate Events', 'Film & TV']);
    assert.deepEqual(body.data.registeredRoles, ['Bartender', 'Event Host']);
    assert.equal(applicantUpsertCalled, true);
    assert.equal(userUpdateCalls.length, 2);
    assert.equal(userUpdateCalls[1].data.applicantId, 'applicant-1');
  } finally {
    prismaAny.$transaction = originalTransaction;
  }
});

test('client change-password verifies the current password before updating the hash', async () => {
  setRequiredEnv();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcrypt');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clientAuth = require('../routes/clientAuth').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../prisma');

  const prismaAny = prisma as any;
  const originalFindUnique = prismaAny.client.findUnique;
  const originalUpdate = prismaAny.client.update;

  const currentPassword = 'CurrentPass123';
  const nextPassword = 'NewSecurePass456';
  const currentHash = await bcrypt.hash(currentPassword, 4);
  let updatedHash = '';

  prismaAny.client.findUnique = async (args: any) => {
    assert.equal(args.where.id, 'client-password-1');
    return {
      id: 'client-password-1',
      email: 'client@example.com',
      companyName: 'Acme Events',
      passwordHash: currentHash,
    };
  };

  prismaAny.client.update = async (args: any) => {
    updatedHash = args.data.passwordHash;
    assert.equal(args.where.id, 'client-password-1');
    assert.equal(args.data.failedAttempts, 0);
    assert.equal(args.data.lockedUntil, null);
    return { id: 'client-password-1' };
  };

  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = {
      clientId: 'client-password-1',
      isClient: true,
      clientLoginTime: Date.now(),
      clientLastActivity: Date.now(),
      destroy: () => {},
    };
    next();
  });
  app.use('/api/v1/client', clientAuth);

  try {
    const response = await inject(app, {
      method: 'PUT',
      url: '/api/v1/client/change-password',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword,
        newPassword: nextPassword,
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body || '{}') as any;

    assert.equal(body.ok, true);
    assert.ok(updatedHash.length > 0);
    assert.notEqual(updatedHash, currentHash);
    assert.equal(await bcrypt.compare(nextPassword, updatedHash), true);
  } finally {
    prismaAny.client.findUnique = originalFindUnique;
    prismaAny.client.update = originalUpdate;
  }
});
