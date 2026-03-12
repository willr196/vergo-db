import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMobileImageUpload } from '../utils/mobileMediaUpload';

function buildMultipartBody(opts: {
  boundary: string;
  fieldName: string;
  fileName: string;
  contentType: string;
  payload: Buffer;
}) {
  const preamble = Buffer.from(
    `--${opts.boundary}\r\n` +
    `Content-Disposition: form-data; name="${opts.fieldName}"; filename="${opts.fileName}"\r\n` +
    `Content-Type: ${opts.contentType}\r\n\r\n`,
    'latin1'
  );
  const epilogue = Buffer.from(`\r\n--${opts.boundary}--\r\n`, 'latin1');
  return Buffer.concat([preamble, opts.payload, epilogue]);
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p2ioAAAAASUVORK5CYII=',
  'base64'
);

test('parseMobileImageUpload trusts the file signature over spoofed multipart metadata', async () => {
  const boundary = 'vergo-test-boundary';
  const body = buildMultipartBody({
    boundary,
    fieldName: 'avatar',
    fileName: 'avatar.jpg',
    contentType: 'image/jpeg',
    payload: PNG_1X1,
  });

  const result = await parseMobileImageUpload(
    body,
    `multipart/form-data; boundary=${boundary}`,
    'avatar'
  );

  assert.equal(result.fileName, 'avatar.jpg');
  assert.equal(result.mimeType, 'image/png');
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
});

test('parseMobileImageUpload rejects uploads without an allowed image signature', async () => {
  const boundary = 'vergo-test-boundary';
  const body = buildMultipartBody({
    boundary,
    fieldName: 'logo',
    fileName: 'logo.png',
    contentType: 'image/png',
    payload: Buffer.from('not actually an image', 'utf8'),
  });

  await assert.rejects(
    () => parseMobileImageUpload(body, `multipart/form-data; boundary=${boundary}`, 'logo'),
    /Unsupported image type/
  );
});
