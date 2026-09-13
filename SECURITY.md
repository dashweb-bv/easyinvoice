# Security

## Supported versions

Only the latest published major version of `easyinvoice` receives security fixes.

## Reporting a vulnerability

Report vulnerabilities in this package privately through
[GitHub private vulnerability reporting](https://github.com/dashweb-bv/easyinvoice/security/advisories/new).
Do not open a public issue for security reports.

Issues in the hosted invoice service itself are handled by
[Budget Invoice](https://www.budgetinvoice.com/); use the contact details published there.

## Handling API keys

Account API keys are secrets. Keep them in server-side environment variables, never in browser
code, public bundles, or version control. The package sends the key only to the hosted API over
HTTPS and never writes it to error messages.
