/**
 * Shared upload helper.
 * Converts a CSV string into a FormData multipart POST to /api/imports/<type>.
 */

'use strict';

const { Blob }     = require('buffer');
const { FormData } = require('node-fetch');
const fetch        = require('node-fetch');

/**
 * @param {string} csvContent  – raw CSV text
 * @param {string} county      – county name, e.g. "Harris"
 * @param {'bcad'|'opr'} type  – import type
 */
async function uploadCsv(csvContent, county, type = 'opr') {
  const workerUrl   = process.env.WORKER_URL;
  const workerEmail = process.env.WORKER_EMAIL;

  if (!workerUrl)   throw new Error('WORKER_URL env var is required');
  if (!workerEmail) throw new Error('WORKER_EMAIL env var is required');

  const filename = `${county.toLowerCase()}-${type}-${Date.now()}.csv`;
  const blob     = new Blob([csvContent], { type: 'text/csv' });

  const form = new FormData();
  form.append('file',   blob, filename);
  form.append('county', county);

  const url  = `${workerUrl}/api/imports/${type}`;
  console.log(`Uploading ${filename} (${csvContent.length} bytes) to ${url} …`);

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'X-User-Email': workerEmail },
    body:    form,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Upload failed ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  console.log(`Upload accepted — job ${data.jobId}`);
  return data.jobId;
}

module.exports = { uploadCsv };
