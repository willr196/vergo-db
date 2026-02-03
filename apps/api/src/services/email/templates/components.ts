// Reusable email template components

import type { InfoBoxVariant, FooterOptions } from '../types';

// Brand colors
const COLORS = {
  gold: '#D4AF37',
  darkGreen: '#2c3e2f',
  lightGray: '#f9f9f9',
  mediumGray: '#666',
  white: '#ffffff',
  // Info box variants
  warningBg: '#fff3cd',
  warningBorder: '#ffc107',
  infoBg: '#e8f4fd',
  infoBorder: '#0066cc',
  successBg: '#d4edda',
  successBorder: '#28a745',
  successText: '#155724',
  dangerBg: '#f8d7da',
  dangerBorder: '#dc3545',
} as const;

// HTML escaping for security
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const safe = (value: string | number | null | undefined): string =>
  escapeHtml(String(value ?? ''));

// Base email wrapper with consistent structure
export const emailWrapper = (content: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VERGO</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f0f0f0;">
  <div style="max-width: 600px; margin: 0 auto;">
    ${content}
  </div>
</body>
</html>
`;

// Gold branded header
export const emailHeader = (): string => `
<div style="background: ${COLORS.gold}; padding: 20px; text-align: center;">
  <h1 style="color: white; margin: 0; font-size: 24px;">VERGO</h1>
</div>
`;

// Footer with optional unsubscribe link
export const emailFooter = (options: FooterOptions = {}): string => {
  const { showUnsubscribe = false, unsubscribeUrl } = options;

  return `
<div style="padding: 20px; text-align: center; color: ${COLORS.mediumGray}; font-size: 12px; background: #f0f0f0;">
  <p style="margin: 0 0 10px 0;">VERGO Ltd | London, United Kingdom</p>
  <p style="margin: 0;">
    <a href="https://vergoltd.com" style="color: ${COLORS.gold}; text-decoration: none;">www.vergoltd.com</a>
  </p>
  ${showUnsubscribe && unsubscribeUrl ? `
    <p style="margin: 15px 0 0 0; font-size: 11px; color: #999;">
      <a href="${safe(unsubscribeUrl)}" style="color: #999; text-decoration: underline;">Unsubscribe from these emails</a>
    </p>
  ` : ''}
</div>
`;
};

// Primary CTA button
export const primaryButton = (text: string, href: string): string => `
<div style="text-align: center; margin: 30px 0;">
  <a href="${safe(href)}" style="display: inline-block; padding: 15px 40px; background: ${COLORS.gold}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
    ${safe(text)}
  </a>
</div>
`;

// Info/warning/success/danger boxes
export const infoBox = (content: string, variant: InfoBoxVariant = 'info'): string => {
  const styles: Record<InfoBoxVariant, { bg: string; border: string; text?: string }> = {
    warning: { bg: COLORS.warningBg, border: COLORS.warningBorder },
    info: { bg: COLORS.infoBg, border: COLORS.infoBorder },
    success: { bg: COLORS.successBg, border: COLORS.successBorder, text: COLORS.successText },
    danger: { bg: COLORS.dangerBg, border: COLORS.dangerBorder },
  };

  const style = styles[variant];

  return `
<div style="margin: 20px 0; padding: 20px; background: ${style.bg}; border-left: 4px solid ${style.border}; border-radius: 4px;${style.text ? ` color: ${style.text};` : ''}">
  ${content}
</div>
`;
};

// White content card
export const contentCard = (content: string, title?: string): string => `
<div style="background: ${COLORS.white}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
  ${title ? `<h3 style="margin-top: 0; color: ${COLORS.darkGreen};">${safe(title)}</h3>` : ''}
  ${content}
</div>
`;

// Content card with left border accent
export const accentCard = (content: string): string => `
<div style="background: ${COLORS.white}; padding: 20px; border-radius: 8px; border-left: 4px solid ${COLORS.gold}; margin: 20px 0;">
  ${content}
</div>
`;

// Styled list items
export const listItems = (items: string[]): string => {
  if (!items.length) return '';
  return `
<ul style="margin: 10px 0; padding-left: 20px;">
  ${items.map(item => `<li style="margin-bottom: 8px;">${safe(item)}</li>`).join('')}
</ul>
`;
};

// Ordered list
export const orderedList = (items: string[]): string => {
  if (!items.length) return '';
  return `
<ol style="margin: 10px 0; padding-left: 20px;">
  ${items.map(item => `<li style="margin-bottom: 8px;">${safe(item)}</li>`).join('')}
</ol>
`;
};

// Detail row (label: value)
export const detailRow = (label: string, value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  return `<p><strong>${safe(label)}:</strong> ${safe(value)}</p>`;
};

// Email link
export const emailLink = (email: string): string =>
  `<a href="mailto:${safe(email)}">${safe(email)}</a>`;

// Main content section with gray background
export const emailBody = (content: string): string => `
<div style="padding: 30px; background: ${COLORS.lightGray};">
  ${content}
</div>
`;

// Section heading
export const sectionHeading = (text: string, emoji?: string): string => `
<h2 style="color: ${COLORS.darkGreen}; margin-top: 0;">
  ${emoji ? `${emoji} ` : ''}${safe(text)}
</h2>
`;

// Plain text paragraph
export const paragraph = (text: string): string =>
  `<p>${safe(text)}</p>`;

// Link display (for copy-paste URLs)
export const linkDisplay = (url: string, label?: string): string => `
${label ? `<p style="color: ${COLORS.mediumGray}; font-size: 14px;">${safe(label)}</p>` : ''}
<p style="color: ${COLORS.mediumGray}; font-size: 12px; word-break: break-all; background: ${COLORS.white}; padding: 10px; border-radius: 4px;">${safe(url)}</p>
`;

// Compose a full email from parts
export const composeEmail = (parts: {
  header?: boolean;
  body: string;
  footer?: FooterOptions;
}): string => {
  const { header = true, body, footer = {} } = parts;
  return emailWrapper(`
    ${header ? emailHeader() : ''}
    ${body}
    ${emailFooter(footer)}
  `);
};
