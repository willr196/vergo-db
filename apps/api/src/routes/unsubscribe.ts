// Unsubscribe management routes

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPreferencesByToken,
  updatePreferences,
  unsubscribeAll,
} from '../services/email/preferences';
import { safe } from '../services/email/templates/components';
import { env } from '../env';

const router = Router();

const viewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

const updateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

/**
 * GET /api/v1/unsubscribe?token=xxx
 * One-click unsubscribe page
 */
router.get('/', viewLimiter, async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).send(renderPage('Invalid unsubscribe link', 'error'));
  }

  try {
    const prefs = await getPreferencesByToken(token);
    if (!prefs) {
      return res.status(404).send(renderPage('Unsubscribe link not found or expired', 'error'));
    }

    // Render preferences form
    res.send(renderPreferencesPage(token, prefs));
  } catch (error) {
    console.error('[UNSUBSCRIBE] Error:', error);
    res.status(500).send(renderPage('Something went wrong. Please try again.', 'error'));
  }
});

/**
 * POST /api/v1/unsubscribe
 * Update email preferences
 */
router.post('/', updateLimiter, async (req, res) => {
  const { token, action, marketing, notifications, jobAlerts, quoteUpdates } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    const prefs = await getPreferencesByToken(token);
    if (!prefs) {
      return res.status(404).json({ error: 'Invalid token' });
    }

    if (action === 'unsubscribe-all') {
      await unsubscribeAll(token);
      return res.send(renderPage(
        'You have been unsubscribed from all emails. You will still receive essential account emails.',
        'success'
      ));
    }

    // Update individual preferences
    await updatePreferences(token, {
      marketing: marketing === 'on',
      notifications: notifications === 'on',
      jobAlerts: jobAlerts === 'on',
      quoteUpdates: quoteUpdates === 'on',
    });

    res.send(renderPage('Your email preferences have been updated.', 'success'));
  } catch (error) {
    console.error('[UNSUBSCRIBE] Update error:', error);
    res.status(500).send(renderPage('Something went wrong. Please try again.', 'error'));
  }
});

/**
 * POST /api/v1/unsubscribe/one-click
 * RFC 8058 one-click unsubscribe (for List-Unsubscribe-Post header)
 */
router.post('/one-click', updateLimiter, async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    const prefs = await getPreferencesByToken(token);
    if (!prefs) {
      return res.status(404).json({ error: 'Invalid token' });
    }

    await unsubscribeAll(token);
    res.json({ success: true });
  } catch (error) {
    console.error('[UNSUBSCRIBE] One-click error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// HTML page renderer
function renderPage(message: string, type: 'success' | 'error'): string {
  const icon = type === 'success' ? '&#10003;' : '&#10007;';
  const color = type === 'success' ? '#28a745' : '#dc3545';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Preferences - VERGO</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 50px auto; background: white; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .icon { font-size: 48px; color: ${color}; margin-bottom: 20px; }
    h1 { color: #2c3e2f; font-size: 20px; }
    p { color: #666; line-height: 1.6; }
    .brand { color: #D4AF37; font-weight: bold; }
    a { color: #D4AF37; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1><span class="brand">VERGO</span></h1>
    <p>${safe(message)}</p>
    <p><a href="${safe(env.webOrigin)}">Return to website</a></p>
  </div>
</body>
</html>`;
}

function renderPreferencesPage(token: string, prefs: {
  marketing: boolean;
  notifications: boolean;
  jobAlerts: boolean;
  quoteUpdates: boolean;
}): string {
  const checked = (val: boolean) => val ? 'checked' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Preferences - VERGO</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 50px auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #2c3e2f; font-size: 22px; margin-top: 0; }
    .brand { color: #D4AF37; }
    .category { padding: 15px 0; border-bottom: 1px solid #eee; }
    .category:last-child { border-bottom: none; }
    .category label { display: flex; align-items: center; gap: 12px; cursor: pointer; }
    .category input[type="checkbox"] { width: 18px; height: 18px; accent-color: #D4AF37; }
    .category-name { font-weight: bold; color: #333; }
    .category-desc { font-size: 13px; color: #666; margin-top: 4px; }
    .actions { margin-top: 25px; display: flex; gap: 10px; flex-direction: column; }
    .btn { padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; }
    .btn-primary { background: #D4AF37; color: white; }
    .btn-danger { background: #f8d7da; color: #dc3545; border: 1px solid #dc3545; }
    .btn:hover { opacity: 0.9; }
    .note { font-size: 12px; color: #999; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="brand">VERGO</span> - Email Preferences</h1>
    <p>Choose which emails you'd like to receive:</p>

    <form method="POST" action="/api/v1/unsubscribe">
      <input type="hidden" name="token" value="${safe(token)}">

      <div class="category">
        <label>
          <input type="checkbox" name="notifications" ${checked(prefs.notifications)}>
          <div>
            <div class="category-name">Notifications</div>
            <div class="category-desc">Application updates, job status changes, account alerts</div>
          </div>
        </label>
      </div>

      <div class="category">
        <label>
          <input type="checkbox" name="jobAlerts" ${checked(prefs.jobAlerts)}>
          <div>
            <div class="category-name">Job Alerts</div>
            <div class="category-desc">Shift reminders and new job opportunities</div>
          </div>
        </label>
      </div>

      <div class="category">
        <label>
          <input type="checkbox" name="quoteUpdates" ${checked(prefs.quoteUpdates)}>
          <div>
            <div class="category-name">Quote Updates</div>
            <div class="category-desc">Quote follow-ups and event booking updates</div>
          </div>
        </label>
      </div>

      <div class="category">
        <label>
          <input type="checkbox" name="marketing" ${checked(prefs.marketing)}>
          <div>
            <div class="category-name">Marketing</div>
            <div class="category-desc">Promotions, newsletters, and special offers</div>
          </div>
        </label>
      </div>

      <div class="actions">
        <button type="submit" class="btn btn-primary">Save Preferences</button>
        <button type="submit" name="action" value="unsubscribe-all" class="btn btn-danger">Unsubscribe from All</button>
      </div>

      <p class="note">You will always receive essential account emails (verification, password resets).</p>
    </form>
  </div>
</body>
</html>`;
}

export default router;
