# Azure Capacity Overview

Atlanta, USA

[![GitHub](https://img.shields.io/badge/--181717?logo=github&logoColor=ffffff)](https://github.com/)
[brown9804](https://github.com/brown9804)

Last updated: 2026-03-25

----------

> Azure Capacity Overview is a static browser app for high-level Azure deployment planning. It refreshes an overview of Azure regional availability, supported SKUs, and service capability signals, shows the latest refresh time in the top-right of the UI, and provides a filtered dashboard for seeing what new workloads can land in a region.

## Quick overview

This project is designed for one main question:

> Which Azure services and resource types appear broadly available in a given region for new workload planning?

It is intentionally lightweight:

- no sign-in required
- no subscription context required
- no backend required
- no deployment dependency beyond static hosting

## What it does

- Shows an Azure availability overview without sign-in, subscription input, or backend setup.
- Displays a visible `Last refresh` timestamp so the team can see when the data was updated.
- Highlights which regions, SKUs, and service types look deployable for new workloads.
- Surfaces restricted or limited offers that may affect rollout planning.
- Filters by availability state, provider, region, and free-text search.
- Publishes cleanly to GitHub Pages with the included workflow.

## How to use it

1. Open the app in the browser.
2. Leave the default regions in place or enter your own target regions.
3. Choose the provider families you want to include.
4. Click `Refresh data`.
5. Review the summary cards, attention items, and detailed table.
6. Use the `Source` actions on each row to open or copy a public Microsoft verification link.

## What the data means

This app does not attempt to show exact real-time free capacity remaining in Azure.

Instead, it provides a planning-oriented overview based on public regional signals such as:

- SKU presence by region
- service presence by region
- zone support
- published capability ceilings such as vCores, tiers, and service objectives

That makes it useful for early regional planning, service comparison, and rollout conversations, but not for proving tenant-specific quota, allocation, or reservation outcomes.

## Included providers

The dashboard focuses on an overview of Azure resource availability rather than current subscription consumption.

<details>
<summary><strong>Rich SKU and capability providers</strong></summary>

- `Microsoft.Compute`: Covers regional VM SKU and infrastructure catalog data, including virtual machine families and sizes such as general purpose, memory optimized, compute optimized, and GPU-backed offers. This is the richest infrastructure planning signal in the dashboard because it exposes SKU names, tiers, family markers, vCPU and memory-related capabilities, disk limits, zone support, and restriction flags that may indicate rollout limits or placement constraints.
- `Microsoft.Sql`: Covers Azure SQL regional capability data for database and managed instance deployment shapes. This helps surface editions, service objectives, compute models, family options, zone-redundancy indicators, and vCore ceilings so you can see whether a target region can support the SQL tier a workload needs.
- `Microsoft.CognitiveServices`: Covers regional AI and Cognitive Services SKU availability, including model-serving and intelligence-oriented account families that appear under Azure AI, OpenAI-related offers, and other cognitive workloads. This is useful for high-level AI planning because it exposes supported SKUs, tiers, kinds, and restriction signals by location.

</details>

<details>
<summary><strong>Broad provider metadata coverage</strong></summary>

- `Microsoft.Web`: Covers App Service-style regional presence for web apps, app hosting plans, sites, and related managed web delivery surfaces. This is useful when checking whether a region broadly supports managed web application deployment patterns and platform-hosted front ends.
- `Microsoft.Network`: Covers foundational network resource metadata such as public IPs, virtual networking building blocks, and related network resource availability. This helps validate whether the region exposes the network primitives a workload will rely on for ingress, egress, routing, and connectivity.
- `Microsoft.Storage`: Covers storage account regional presence and zone-related signals across core storage-style services. This is useful for understanding whether the target region broadly supports account-based storage foundations used by blobs, files, queues, tables, and durable application state.
- `Microsoft.ContainerService`: Covers AKS and managed cluster resource metadata. This helps indicate whether a region supports the baseline managed Kubernetes control-plane footprint needed for container platform rollout and cluster-based application hosting.
- `Microsoft.DBforPostgreSQL`: Covers Azure Database for PostgreSQL regional metadata. This is useful for validating broad service presence when planning PostgreSQL-backed applications, operational data stores, and managed relational database workloads by region.
- `Microsoft.DBforMySQL`: Covers Azure Database for MySQL regional metadata. This provides the same type of regional service-presence signal for MySQL-backed applications, packaged platforms, and managed relational workloads.
- `Microsoft.DocumentDB`: Covers Cosmos DB regional metadata. This helps show whether globally distributed NoSQL-style data services are represented in the target region for document, key-value, and application data scenarios.
- `Microsoft.Cache`: Covers Azure Cache and Redis-style managed cache metadata. This is useful when planning architectures that depend on low-latency in-memory caching, session storage, or acceleration layers near the application tier.
- `Microsoft.Search`: Covers Azure AI Search regional metadata. This helps indicate whether managed search, indexing, and retrieval capabilities are available in the selected region for application discovery and knowledge-oriented workloads.
- `Microsoft.EventHub`: Covers Event Hubs regional metadata. This is useful for event streaming, telemetry ingestion, log pipeline, and high-throughput messaging scenarios that need confirmation of regional service presence.
- `Microsoft.ServiceBus`: Covers Service Bus regional metadata. This helps validate availability for queueing, topic-based messaging, workflow decoupling, and enterprise integration workloads.
- `Microsoft.KeyVault`: Covers Key Vault regional metadata. This is important for confirming the regional presence of secrets, keys, and certificate management services that many workloads treat as foundational security dependencies.
- `Microsoft.App`: Covers Azure Container Apps and related modern app-platform metadata. This is useful for checking whether newer app hosting patterns, microservice deployments, and serverless container-style runtimes are broadly represented in a region.
- `Microsoft.SignalRService`: Covers managed SignalR regional metadata. This helps validate support for real-time messaging, live dashboards, collaborative features, and websocket-backed application experiences.
- `Microsoft.MachineLearningServices`: Covers Azure Machine Learning regional metadata. This is useful for understanding whether ML workspace-style platform components, training pipelines, and model operations surfaces are represented in the region.
- `Microsoft.Databricks`: Covers Azure Databricks regional metadata. This helps with analytics, lakehouse, and data-engineering planning when a workload depends on managed Spark and collaborative data platform services.

</details>

<details>
<summary><strong>Why these providers were chosen</strong></summary>

Azure does not expose one universal API with actual global free-capacity counts for brand new customers. Capacity-related signals are fragmented across providers, API versions, and service-specific metadata shapes.

For that reason, the app uses an extendable provider registry in [src/providers.js](src/providers.js) instead of assuming one shared Azure capacity schema. The current app renders an overview catalog built from those provider families so the dashboard remains usable without sign-in or subscription scope.

The closest reliable signals for a planning overview are:

- regional SKU availability
- provider resource-type availability by region
- zonal support
- capability ceilings such as supported vCores or service objectives

</details>

## Refresh overview data

1. Optionally enter target regions.
2. Choose the availability providers to display.
3. Click `Refresh data`.

The dashboard refreshes its built-in Azure availability overview catalog and updates the filtered planning view without requiring sign-in or subscription scope.

Use the `Source` actions in the UI to open or copy the relevant public Microsoft verification link for each row.

<details>
<summary><strong>Notes and limits</strong></summary>

- Azure does not publish a single public feed that says exactly how much free infrastructure remains globally for new customers.
- The data shown here is an overview catalog for planning: supported SKUs, service presence in region, zones, and SQL capability ceilings.
- Because this version is meant for broad regional availability research, it points to public Microsoft availability references rather than tenant-specific or subscription-scoped checks.

</details>

## Deploy to GitHub Pages

This repo includes a Pages workflow in `.github/workflows/deploy-pages.yml`.

1. Push the repository to GitHub.
2. In GitHub, open `Settings` > `Pages`.
3. Set the source to `GitHub Actions`.
4. Push to the default branch.
5. Wait for the `Deploy GitHub Pages` workflow to finish.

<details>
<summary><strong>Project files</strong></summary>

- [index.html](index.html) contains the static layout.
- [styles.css](styles.css) contains the UI styling.
- [src/app.js](src/app.js) handles overview refresh, filtering, and rendering.
- [src/providers.js](src/providers.js) defines the supported Azure availability provider families.

</details>

<!-- START BADGE -->
<div align="center">
  <img src="https://img.shields.io/badge/Total%20views-1580-limegreen" alt="Total views">
  <p>Refresh Date: 2026-02-25</p>
</div>
<!-- END BADGE -->
