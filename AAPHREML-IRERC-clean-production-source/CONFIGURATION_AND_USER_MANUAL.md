# AAPHREML-IRERC Configuration and Operations Manual

## Architecture

GitHub is the source of truth. GitHub Pages publishes the frontend. GitHub Actions assembles the Apps Script backend as one generated Code.gs file and the required manifest, then updates an existing Apps Script web-app deployment. Google Sheets and Drive store the portal data. See [the deployment guide](GITHUB_AND_GOOGLE_DRIVE_INTEGRATION_GUIDE.md) for the full first-time setup.

The preview file is for layout review only. It has no backend connection, accounts, or sample protocol data.

## One-time deployment checklist

1. Confirm CFG.DB_SS_ID, CFG.SHEET_ID, and CFG.FOLDER_ID in server/Config.gs match institution-owned resources.
2. Confirm the deploying Google account can edit both spreadsheets and the Drive folder.
3. Create the Apps Script project from the output of node scripts/build-gas.js; push the generated Code.gs and appsscript.json.
4. Run initDatabase_() from the Apps Script editor to create schema tabs.
5. Set INITIAL_ADMIN_EMAIL and a unique INITIAL_ADMIN_PASSWORD (12+ characters) in Script Properties. Run bootstrapAdministrator_() from the editor once. Successful setup deletes those temporary properties.
6. Create the Apps Script web-app deployment, execute as the institutional deployment account, and use the access policy approved by the institution.
7. Configure GitHub Actions environment irerc-production with secret CLASPRC_JSON and variables IRERC_SCRIPT_ID, IRERC_DEPLOYMENT_ID.
8. Merge a source update to main and confirm both workflow jobs succeed. The portal URL is [https://aardmc.github.io/AAPHREML-IRERC/](https://aardmc.github.io/AAPHREML-IRERC/).

## User and record operations

- Create and administer user accounts through the portal's authenticated administration screens.
- Keep passwords, OAuth/clasp credentials, signature images, and research documents out of Git.
- Review access controls and account roles before granting users access to research records.
- Follow institutional backup, retention, incident response, and ethics-record handling policies.
- New uploaded documents are stored under the configured Drive folder in `AAPHREML-IRERC_Documents/<protocol_id>/`. Proposal scan staging files use `AAPHREML-IRERC_Documents/Proposal Scans/<user_id>/` until attached to a protocol.
- Existing Drive files are left in place; this source change does not move or delete previously uploaded files.
- Source cleanup does not erase anything already stored in Sheets or Drive; review existing data separately before production.

## Security notes

The Apps Script bridge is framed by GitHub Pages and accepts requests only from the configured Pages origin. The server exposes only named API wrappers and verifies server-issued expiring sessions for protected operations. apiInitDatabase is excluded from the bridge.

The app manifest runs as the deploying account and allows anonymous web-app entry so the bridge can load. Anonymous entry does not bypass portal authentication. Validate this deployment model against institutional policy. Password hashes currently use salted SHA-256, not a slow password KDF; treat that as a known security limitation.
