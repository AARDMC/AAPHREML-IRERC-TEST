# AAPHREML-IRERC Research Ethics Portal

Source repository for the Addis Ababa City Administration Health Bureau Institutional Research Ethics Review Committee portal.

## Hosting architecture

- **GitHub Pages** publishes the portal interface at [https://aardmc.github.io/AAPHREML-IRERC/](https://aardmc.github.io/AAPHREML-IRERC/).
- **Google Apps Script** runs the backend as one generated Code.gs file plus the required appsscript.json manifest.
- The Pages frontend calls an Apps Script HTML bridge over an origin-checked postMessage channel. It cannot call google.script.run directly.
- Google Sheets stores application and scanner data; Google Drive stores uploaded protocol documents.

Edit modular sources in this repository (Code.gs, server/, Index.html, client/, and styles/). The Actions deployment workflow bundles these into the Apps Script target and publishes the Pages site.

## Google resource IDs

The user-provided database spreadsheet, scanner spreadsheet, and Drive folder IDs are set in server/Config.gs. Before deployment, verify the Apps Script deployment account has access to both spreadsheets and Editor access to the Drive folder. The IDs do not grant access by themselves.

No sample users, default credentials, demo protocols, mock data API, or seeded examples are included. Removing sample source does not delete records already present in Google Sheets or Drive.

## One-time owner setup

Follow [the integration and deployment guide](GITHUB_AND_GOOGLE_DRIVE_INTEGRATION_GUIDE.md) to create the Apps Script project and first web-app deployment, initialize the sheets, bootstrap the first administrator, and configure the GitHub Actions environment. The production workflow needs:

- Environment irerc-production
- Secret CLASPRC_JSON containing the authorized account's clasp credentials
- Variables IRERC_SCRIPT_ID and IRERC_DEPLOYMENT_ID

After these are configured, merging a source change to main deploys the backend and then GitHub Pages. A successful merge alone does not confirm successful deployment; check the **Deploy AAPHREML-IRERC** workflow.

## Important limits

The manifest executes the web app as its deploying account and permits anonymous entry to the portal; application APIs enforce user sessions and roles. Confirm institutional access, backup, retention, and deployment policies before using real records. Password hashes use salted SHA-256 rather than a slow password KDF; this remains a security limitation.

See [the configuration manual](CONFIGURATION_AND_USER_MANUAL.md), [architecture](docs/ARCHITECTURE.md), and [change log](docs/CHANGE_LOG.md).
