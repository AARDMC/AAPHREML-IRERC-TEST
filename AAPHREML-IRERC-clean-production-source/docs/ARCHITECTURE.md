# AAPHREML-IRERC Architecture

## Deployment shape

    Browser
      ├── GitHub Pages frontend
      │      └── origin-checked postMessage RPC
      │              └── Apps Script HTML bridge
      └── Application session token
              └── Apps Script API dispatcher
                      ├── Google Sheets (database and scanner)
                      ├── Google Drive (protocol files)
                      └── authorized Google services

The frontend is source-controlled in GitHub and compiled to Pages. Apps Script runs the backend. GitHub Actions bundles the modular server code, bridge HTML, and entry point into one generated Code.gs; it also pushes appsscript.json, which Apps Script requires as the project manifest. The generated .gas-build allowlist excludes the modular files and HTML. Edit the repository sources, never the generated Apps Script bundle.

## Request flow

1. GitHub Pages loads the portal and its backend URL from the build configuration.
2. The portal creates a hidden iframe to the Apps Script web app's ?bridge=1 endpoint.
3. The bridge accepts postMessage calls only from the configured Pages origin and only for a fixed API allowlist.
4. The API dispatcher validates the session token for protected calls, installs the current user context, and invokes the server service.
5. Server services use the configured Google Sheets and Drive resources. The frontend receives the result through the iframe message channel.

The root Apps Script URL serves a link to the Pages frontend. The bridge disables the default frame restriction because it must be embedded; the HTML bridge checks its parent origin and does not expose database initialization through RPC. These browser checks complement, but do not replace, server authentication and authorization.

## Source components

- Code.gs: web entry point, API dispatch wrappers, and legacy caller compatibility
- server/Config.gs: institutional metadata and Google resource IDs
- server/Bridge.html: embedded into generated Code.gs by the build
- server/Auth.gs: salted password hashes, expiring server-side tokens, and roles
- Other server/*.gs: database, protocols, screening, review, decision, document, meeting, reporting, scanner, and monitoring services
- Index.html, client/, styles/: frontend and its disconnected preview
- scripts/build-gas.js, scripts/build-pages.js: production bundles

## Google resource model

CFG.DB_SS_ID identifies the primary spreadsheet database; CFG.SHEET_ID identifies the scanner workbook; CFG.FOLDER_ID identifies the document folder. Apps Script executes as the deploying account, which must be able to access these resources. The source cannot verify those external permissions.

## Deployment lifecycle

A first-time owner creates the Apps Script project, initializes database tabs, creates a unique administrator, authorizes Google scopes, and creates a web-app deployment. GitHub environment irerc-production then stores IRERC_SCRIPT_ID, IRERC_DEPLOYMENT_ID, and secret CLASPRC_JSON. A qualifying push to main updates Apps Script first, builds the Pages artifact with that deployment URL, and publishes the site. Pull request checks validate source/preview only.

## Security boundaries

- Public users can load the portal page; protected data APIs require a valid application session and role.
- The Apps Script web app executes as the deploying account. Anonymous access is required for the cross-origin bridge in this configuration, so the institution must approve that access model.
- The bridge exposes named api* wrappers and excludes apiInitDatabase.
- Credentials, official signature images, and research records belong in protected Google storage or GitHub environment secrets, never in Git.
- Password hashes use salted SHA-256 rather than a slow password KDF. This is a known security limitation.
