#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
let html = read('Index.html');
const replacements = [
  ["<?!= include_('styles/styles') ?>", read('styles/styles.html')],
  ["<?!= include_('client/app') ?>", read('client/app.html')],
  ["<?!= include_('client/views') ?>", read('client/views.html')],
  ['<?!= logoDataUri ?>', 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'Logo File.png')).toString('base64')]
];
replacements.forEach(function(pair) {
  if (html.indexOf(pair[0]) === -1) throw new Error('Missing preview template marker: ' + pair[0]);
  html = html.replace(pair[0], pair[1]);
});
if (html.indexOf('<!-- IRERC_PAGES_CONFIG -->') === -1) throw new Error('Missing Pages configuration marker.');
html = html.replace('<!-- IRERC_PAGES_CONFIG -->', '');
html = html.replace(/[ \\t]+$/gm, '');
if (html.indexOf('<?!') !== -1) throw new Error('Unresolved template marker in preview output.');
fs.writeFileSync(path.join(root, 'preview.html'), '\uFEFF' + html, 'utf8');
console.log('Built preview.html.');
