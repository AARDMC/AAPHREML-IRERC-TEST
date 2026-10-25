# Change Log

## Clean source update

- Removed the demo data seeder and its public API endpoint.
- Removed mock accounts, role shortcuts, example protocol and meeting records, and the offline mock API.
- Preserved the repository's server-issued session authentication.
- Replaced fixed meeting examples with records loaded from the Apps Script backend.
- Kept the official signature in restricted Google Drive storage and excluded it from Git.
- Clarified that source cleanup does not delete records already stored in Sheets or Drive.
- Configured the owner-provided Drive folder ID as the document vault in `server/Config.gs`.
- Added the owner-provided database and scanner spreadsheet IDs to `server/Config.gs`.
- Google resource access and ownership still require verification.

## GitHub Pages and Apps Script deployment

- Added a GitHub Pages frontend build and an origin-checked Apps Script iframe RPC bridge.
- Added a build that bundles the modular server into the single Apps Script Code.gs source plus the required manifest.
- Added sequential production workflow jobs: deploy Apps Script, build the site with its backend URL, then publish GitHub Pages.
- Corrected the configured Drive folder ID to match the owner-provided folder link.
- Fixed the extra closing brace in the Apps Script entry point.
- Made the PowerShell preview command use the same Node builder as CI for a consistent generated preview.
- Updated deployment and architecture documentation. Production still requires an Apps Script project/deployment and the protected GitHub environment values.
