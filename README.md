# Azure Capacity Overview

Atlanta, USA

[![GitHub](https://img.shields.io/badge/--181717?logo=github&logoColor=ffffff)](https://github.com/)
[brown9804](https://github.com/brown9804)

Last updated: 2026-03-25

----------

> Azure Capacity Overview is a static browser app for proactive Azure deployment planning. It refreshes Azure regional availability, supported SKUs, and service capability metadata, shows the latest refresh time in the top-right of the UI, and provides a filtered dashboard for seeing what new workloads can land in a region.

## What it does

- Signs users in interactively with Microsoft Entra ID through MSAL.
- Queries Azure ARM availability, SKU, and provider metadata endpoints on demand from the browser.
- Displays a visible `Last refresh` timestamp so the team can see when the data was updated.
- Shows which regions, SKUs, and service types are deployable for new workloads.
- Highlights restricted or limited offers that may block a rollout.
- Filters by availability state, provider, region, and free-text search.
- Includes a demo mode so the dashboard can be reviewed before live Azure access is available.
- Publishes cleanly to GitHub Pages with a built-in deployment workflow.

## Included providers

The dashboard now focuses on deployability and available offers rather than current subscription consumption.

Rich SKU and capability providers:

- `Microsoft.Compute` regional SKU catalog
- `Microsoft.Sql` regional SQL capability catalog
- `Microsoft.CognitiveServices` regional SKU catalog

Broad provider metadata coverage:

- `Microsoft.Web`
- `Microsoft.Network`
- `Microsoft.Storage`
- `Microsoft.ContainerService`
- `Microsoft.DBforPostgreSQL`
- `Microsoft.DBforMySQL`
- `Microsoft.DocumentDB`
- `Microsoft.Cache`
- `Microsoft.Search`
- `Microsoft.EventHub`
- `Microsoft.ServiceBus`
- `Microsoft.KeyVault`
- `Microsoft.App`
- `Microsoft.SignalRService`
- `Microsoft.MachineLearningServices`
- `Microsoft.Databricks`

Azure does not expose one universal API with actual global free-capacity counts for brand new customers. Capacity-related signals are fragmented across ARM because each resource provider publishes its own management surface, API versions, and response shape. Some providers expose rich regional SKU catalogs, some expose capability documents, and many only expose regional resource-type metadata.

For that reason, the app pulls information directly from Azure Resource Manager APIs through an extendable provider registry in [src/providers.js](src/providers.js) instead of assuming one shared Azure capacity schema. Each provider entry defines:

- which ARM endpoint to call
- whether the call is regional or scope-based
- which API version to use
- how the provider response should be normalized into the dashboard's common availability model

That approach keeps the dashboard layer stable while letting you expand coverage incrementally as Azure exposes more useful metadata for additional services.

The closest reliable signals available through ARM are:

- regional SKU availability
- provider resource-type availability by region
- zonal support
- restrictions returned by Azure for the authenticated API scope
- capability ceilings such as supported vCores or service objectives

Provider behavior is not fully uniform. Some services return complete regional metadata consistently, while others can fail for specific Azure scopes, regions, registration states, or API versions. The dashboard treats those as partial provider errors instead of failing the entire refresh, so one weak provider does not block the rest of the planning view.

This is especially relevant for providers such as App Service and AKS, where ARM behavior can vary by scope and API version even when the namespace is valid.

## Configure Microsoft Entra authentication

This app uses MSAL in the browser and does not require a backend.

1. Create or reuse a Microsoft Entra app registration.
2. Add a `Single-page application` redirect URI for each environment you will use.
3. Add delegated permission for `Azure Service Management` with `user_impersonation`.
4. Grant admin consent if your tenant requires it.
5. Copy the application `Client ID`.
6. In the dashboard, enter:
	- `Tenant ID or domain`, for example `organizations`, a tenant GUID, or `contoso.onmicrosoft.com`
	- `App registration client ID`
7. Click `Sign in`.

### Redirect URIs to register

- GitHub Pages: `https://<github-username>.github.io/<repository-name>/`

## Refresh live Azure data

1. Sign in from the dashboard.
2. Enter one or more subscription IDs so ARM can resolve the availability APIs.
3. Optionally enter target regions. If you leave the region list empty, the app can auto-discover physical regions from the selected Azure scopes.
4. Choose the availability providers to scan.
5. Click `Refresh data`.

Azure ARM availability and SKU endpoints are generally scoped to a subscription. The app uses that API scope to query Azure directly and normalize the results into a deployability view, not to report current quota consumption.

## Notes and limits

- The app does not persist access tokens manually; MSAL manages browser token cache for the configured public client.
- Live refreshes can generate many ARM requests when many Azure scopes, regions, and providers are selected.
- Azure does not publish a single public feed that says exactly how much free infrastructure remains globally for new customers.
- The data shown here is the best practical proactive signal available from ARM for new deployments: supported SKUs, service presence in region, zones, restrictions, and SQL capability ceilings.
- Results can still differ by Azure scope because some SKUs are marked `NotAvailableForSubscription` or blocked by policy, registration state, or rollout rules.

## Deploy to GitHub Pages

This repo now includes a Pages workflow in `.github/workflows/deploy-pages.yml`.

1. Push the repository to GitHub.
2. In GitHub, open `Settings` > `Pages`.
3. Set the source to `GitHub Actions`.
4. Push to the default branch.
5. Wait for the `Deploy GitHub Pages` workflow to finish.
6. Add the final Pages URL as a redirect URI on your Microsoft Entra app registration.

## Project files

- [index.html](index.html) contains the static layout.
- [styles.css](styles.css) contains the UI styling.
- [src/app.js](src/app.js) handles refresh, Azure API calls, filtering, and rendering.
- [src/auth.js](src/auth.js) manages Microsoft Entra sign-in and token acquisition through MSAL.
- [src/providers.js](src/providers.js) defines the supported Azure availability and SKU endpoints.

<!-- START BADGE -->
<div align="center">
  <img src="https://img.shields.io/badge/Total%20views-1580-limegreen" alt="Total views">
  <p>Refresh Date: 2026-02-25</p>
</div>
<!-- END BADGE -->
