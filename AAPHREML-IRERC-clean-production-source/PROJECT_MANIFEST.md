# Project Manifest

## AAPHREML-IRERC Research Ethics Portal

### Hosting

- **Frontend:** GitHub Pages at https://aardmc.github.io/AAPHREML-IRERC/
- **Backend:** Google Apps Script web app
- **Source of truth:** This GitHub repository
- **Apps Script payload:** generated Code.gs plus required appsscript.json manifest
- **Bridge:** Apps Script HtmlService iframe with an origin-checked postMessage protocol
- **Data:** Google Sheets and restricted Google Drive

### Source map

| Path | Purpose |
|---|---|
| Code.gs, server/*.gs | Modular Apps Script source and API wrappers |
| server/Bridge.html | Backend RPC bridge template embedded into generated Code.gs |
| Index.html, client/, styles/ | Frontend source compiled for Pages |
| scripts/build-gas.js | Builds the single-file Apps Script payload |
| scripts/build-pages.js | Builds the GitHub Pages frontend with the configured backend URL |
| scripts/build-preview.js | Produces the disconnected local preview |
| appsscript.json | Required Apps Script manifest |
| .github/workflows/deploy-irerc.yml | Production deploy workflow |

### Google resources

server/Config.gs contains the user-provided application spreadsheet ID, scanner spreadsheet ID, and Drive folder ID. Permissions must be verified by the institutional Apps Script deploying account; IDs do not grant access. Signature assets remain in restricted Drive storage.

### Deployment requirements

The GitHub Actions environment irerc-production requires secret CLASPRC_JSON and variables IRERC_SCRIPT_ID and IRERC_DEPLOYMENT_ID. The workflow updates an already-created Apps Script web-app deployment, then publishes Pages. The first project, first deployment, database initialization, and initial administrator are set up once by an authorized owner.

### Authentication and data handling

No default administrator, seeded users, demo protocols, mock API, or sample records are included. The portal uses expiring server-issued session tokens and role checks. Password hashes use salted SHA-256, not a slow password KDF; this is a known limitation. Cleaning source code does not delete data that may already exist in Google Sheets or Drive.

See the [deployment guide](GITHUB_AND_GOOGLE_DRIVE_INTEGRATION_GUIDE.md), [operations manual](CONFIGURATION_AND_USER_MANUAL.md), [architecture](docs/ARCHITECTURE.md), and [change log](docs/CHANGE_LOG.md).
