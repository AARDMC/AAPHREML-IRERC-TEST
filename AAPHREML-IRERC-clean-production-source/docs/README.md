# AAPHREML-IRERC Source Documentation

The application frontend is published through GitHub Pages, while Google Apps Script runs the backend. The Apps Script bundle is generated from modular repository source and contains one .gs file (Code.gs) plus the required project manifest.

- [GitHub Pages and Google Apps Script deployment guide](../GITHUB_AND_GOOGLE_DRIVE_INTEGRATION_GUIDE.md)
- [Configuration and operations manual](../CONFIGURATION_AND_USER_MANUAL.md)
- [Architecture and request flow](ARCHITECTURE.md)
- [Change log](CHANGE_LOG.md)

Google resource IDs are set in server/Config.gs; the deploying account's access still needs to be verified. The offline preview contains no backend or sample data. Production deployment requires the irerc-production GitHub environment and a successful Deploy AAPHREML-IRERC Actions run.
