const csv = require('csv-parser');
const { Readable } = require('stream');
const fs = require('fs');


/**
 * Returns a promise that resolves with an array of objects
 * @param {Buffer|Stream|string} input   // buffer from multer, read-stream, or file path
 * @param {object} opts                  // optional csv-parser options (headers, skip, …)
 * @returns {Promise<Array<object>>}
 */
function readCsv(input, opts = {}) {
  return new Promise((resolve, reject) => {
    const rows = [];

    let stream;
    if (Buffer.isBuffer(input)) stream = Readable.from(input);
    else if (typeof input === 'string') stream = require('fs').createReadStream(input);
    else if (typeof input.pipe === 'function') stream = input;
    else return reject(new Error('csvReader: input must be buffer, stream or file path'));

    stream
      .pipe(csv(opts))
      .on('data', (row) => {
        rows.push(row["Product URL"])
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

module.exports = readCsv;