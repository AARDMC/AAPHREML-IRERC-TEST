// Signature image is read from the configured Drive file on demand.

function getSignatureDataUri_() {
  var fileId = PropertiesService.getScriptProperties().getProperty('SIGNATURE_FILE_ID');
  if (!fileId) return '';

  var blob = DriveApp.getFileById(fileId).getBlob();
  if (blob.getContentType() !== 'image/png') {
    throw new Error('The configured chairperson signature must be a PNG image.');
  }
  return 'data:image/png;base64,' + Utilities.base64Encode(blob.getBytes());
}
