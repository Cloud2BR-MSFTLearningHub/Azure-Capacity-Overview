import { acquireArmToken, getAuthState, getRedirectUri, signIn, signOut } from "./auth.js";
import { PROVIDERS, createProviderOptionsMarkup, getProvider } from "./providers.js";

const MANAGEMENT_ROOT = "https://management.azure.com";
const SETTINGS_KEY = "azure-capacity-overview-settings";

const state = {
  allRecords: [],
  filteredRecords: [],
  lastRefresh: null,
  regionsScanned: 0,
  loading: false,
  authAccount: null,
};

const elements = {
  providerOptions: document.querySelector("#provider-options"),
  tenantInput: document.querySelector("#tenant-input"),
  clientIdInput: document.querySelector("#client-id-input"),
  redirectUriInput: document.querySelector("#redirect-uri-input"),
  signInButton: document.querySelector("#sign-in-button"),
  signOutButton: document.querySelector("#sign-out-button"),
  accountLabel: document.querySelector("#account-label"),
  authHelper: document.querySelector("#auth-helper"),
  subscriptionsInput: document.querySelector("#subscriptions-input"),
  regionsInput: document.querySelector("#regions-input"),
  autodiscoverToggle: document.querySelector("#autodiscover-toggle"),
  refreshButton: document.querySelector("#refresh-button"),
  demoButton: document.querySelector("#demo-button"),
  lastRefresh: document.querySelector("#last-refresh"),
  statusBadge: document.querySelector("#status-badge"),
  summaryCards: document.querySelector("#summary-cards"),
  providerBreakdown: document.querySelector("#provider-breakdown"),
  priorityList: document.querySelector("#priority-list"),
  searchInput: document.querySelector("#search-input"),
  riskFilter: document.querySelector("#risk-filter"),
  providerFilter: document.querySelector("#provider-filter"),
  subscriptionFilter: document.querySelector("#subscription-filter"),
  regionFilter: document.querySelector("#region-filter"),
  atRiskToggle: document.querySelector("#at-risk-toggle"),
  tableMeta: document.querySelector("#table-meta"),
  tableBody: document.querySelector("#capacity-table-body"),
};

bootstrap().catch((error) => {
  console.error(error);
  setStatus(error.message || "Failed to initialize the dashboard.", "bad");
});

async function bootstrap() {
  elements.providerOptions.innerHTML = createProviderOptionsMarkup();
  elements.redirectUriInput.value = getRedirectUri();
  hydrateSavedSettings();
  wireEvents();
  renderEmptySummary();
  await refreshAuthState();
}

function wireEvents() {
  elements.refreshButton.addEventListener("click", refreshData);
  elements.demoButton.addEventListener("click", loadDemoData);
  elements.signInButton.addEventListener("click", signInToAzure);
  elements.signOutButton.addEventListener("click", signOutFromAzure);

  [
    elements.searchInput,
    elements.riskFilter,
    elements.providerFilter,
    elements.subscriptionFilter,
    elements.regionFilter,
    elements.atRiskToggle,
  ].forEach((element) => {
    element.addEventListener("input", applyFilters);
    element.addEventListener("change", applyFilters);
  });

  [
    elements.tenantInput,
    elements.clientIdInput,
    elements.subscriptionsInput,
    elements.regionsInput,
    elements.autodiscoverToggle,
  ].forEach((element) => {
    element.addEventListener("change", persistSettings);
  });

  elements.providerOptions.addEventListener("change", persistSettings);
  elements.tenantInput.addEventListener("change", refreshAuthState);
  elements.clientIdInput.addEventListener("change", refreshAuthState);
}

function hydrateSavedSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    elements.tenantInput.value = "organizations";
    return;
  }

  try {
    const settings = JSON.parse(raw);
    elements.tenantInput.value = settings.tenantId ?? "organizations";
    elements.clientIdInput.value = settings.clientId ?? "";
    elements.subscriptionsInput.value = settings.subscriptions ?? "";
    elements.regionsInput.value = settings.regions ?? "";
    elements.autodiscoverToggle.checked = settings.autodiscover ?? true;

    if (Array.isArray(settings.providers) && settings.providers.length > 0) {
      for (const checkbox of elements.providerOptions.querySelectorAll('input[type="checkbox"]')) {
        checkbox.checked = settings.providers.includes(checkbox.value);
      }
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
    elements.tenantInput.value = "organizations";
  }
}

function persistSettings() {
  const settings = {
    tenantId: elements.tenantInput.value.trim() || "organizations",
    clientId: elements.clientIdInput.value.trim(),
    subscriptions: elements.subscriptionsInput.value.trim(),
    regions: elements.regionsInput.value.trim(),
    autodiscover: elements.autodiscoverToggle.checked,
    providers: getSelectedProviderIds(),
  };

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function refreshData() {
  const subscriptionIds = parseList(elements.subscriptionsInput.value);
  const selectedProviderIds = getSelectedProviderIds();
  const manualRegions = parseList(elements.regionsInput.value).map(normalizeRegion);
  const shouldAutodiscover = elements.autodiscoverToggle.checked;
  const authSettings = getAuthSettings();

  if (!authSettings.clientId) {
    setStatus("Provide a Microsoft Entra app registration client ID before refreshing.", "warn");
    return;
  }

  if (subscriptionIds.length === 0) {
    setStatus("Add at least one Azure scope subscription ID before refreshing.", "warn");
    return;
  }

  if (selectedProviderIds.length === 0) {
    setStatus("Select at least one availability provider to query.", "warn");
    return;
  }

  persistSettings();
  setLoading(true);
  setStatus("Refreshing Azure availability data...", "neutral");

  try {
    const authResult = await acquireArmToken(authSettings);
    applyAuthState(authResult.account);

    const regions = manualRegions.length > 0 ? manualRegions : await getRegions(subscriptionIds, authResult.token, shouldAutodiscover);
    const collection = await collectAvailabilityData({
      token: authResult.token,
      subscriptionIds,
      regions,
      providerIds: selectedProviderIds,
    });

    state.allRecords = collection.records.map(enrichRecord).sort(sortAvailabilityRecords);
    state.regionsScanned = collection.regionsScanned;
    state.lastRefresh = new Date();
    elements.lastRefresh.textContent = formatDateTime(state.lastRefresh);

    populateFilterOptions(state.allRecords);
    applyFilters();

    if (collection.errors.length > 0 && state.allRecords.length > 0) {
      setStatus(`Refresh completed with ${collection.errors.length} partial provider errors.`, "warn");
    } else if (state.allRecords.length === 0) {
      setStatus("Refresh completed but no availability records were returned.", "warn");
    } else {
      setStatus(`Refresh completed. ${state.allRecords.length} availability rows loaded.`, deriveDashboardStatus(state.allRecords));
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Refresh failed.", "bad");
  } finally {
    setLoading(false);
  }
}

async function getRegions(subscriptionIds, token, shouldAutodiscover) {
  if (!shouldAutodiscover) {
    throw new Error("Provide target regions or enable auto-discovery.");
  }

  const uniqueRegions = new Set();

  for (const subscriptionId of subscriptionIds) {
    const locations = await armGet(
      `/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`,
      token,
    );

    for (const location of locations.value ?? []) {
      if (location.type !== "Region") {
        continue;
      }

      if (location.metadata?.regionType && location.metadata.regionType !== "Physical") {
        continue;
      }

      uniqueRegions.add(normalizeRegion(location.name));
    }
  }

  return [...uniqueRegions].sort();
}

async function collectAvailabilityData({ token, subscriptionIds, regions, providerIds }) {
  const tasks = [];
  const errors = [];

  for (const subscriptionId of subscriptionIds) {
    for (const providerId of providerIds) {
      const provider = getProvider(providerId);
      if (!provider) {
        continue;
      }

      if (provider.scope === "regional") {
        for (const location of regions) {
          tasks.push(async () => {
            try {
              const payload = await armGet(provider.buildPath({ subscriptionId, location }), token);
              return provider.normalizeResponse({
                subscriptionId,
                region: location,
                regions,
                payload,
              });
            } catch (error) {
              errors.push(`${provider.label} ${subscriptionId} ${location}: ${error.message}`);
              return [];
            }
          });
        }
      } else {
        tasks.push(async () => {
          try {
            const payload = await armGet(provider.buildPath({ subscriptionId }), token);
            return provider.normalizeResponse({
              subscriptionId,
              regions,
              payload,
            });
          } catch (error) {
            errors.push(`${provider.label} ${subscriptionId}: ${error.message}`);
            return [];
          }
        });
      }
    }
  }

  const taskResults = await runWithConcurrency(tasks, 6);
  const records = taskResults.flat();

  return {
    records,
    errors,
    regionsScanned: new Set(regions).size,
  };
}

function enrichRecord(record) {
  const availability = record.availability || "available";

  return {
    ...record,
    availability,
    severity: severityFromAvailability(availability, record.severity),
    searchIndex: [record.providerLabel, record.name, record.resourceType, record.region, record.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function loadDemoData() {
  const subscriptions = [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
  ];
  const regions = ["eastus", "westeurope", "centralus"];
  const demoRows = [];

  for (const subscriptionId of subscriptions) {
    for (const region of regions) {
      demoRows.push(
        createDemoRow("Compute SKUs", subscriptionId, region, "Standard_D8s_v5", "virtualMachines", "vCPUs", 8, "vCPUs", "available", "8 vCPUs · 32 GB RAM · 3 zones"),
        createDemoRow("Compute SKUs", subscriptionId, region, "Standard_NC24ads_A100_v4", "virtualMachines", "GPUs", 1, "GPU", region === "centralus" ? "restricted" : "available", region === "centralus" ? "Restricted in current Azure scope or region" : "A100 available"),
        createDemoRow("SQL Capabilities", subscriptionId, region, "BusinessCritical BC_Gen5_16", "servers/databases", "VCores", 16, "VCores", "available", "BusinessCritical · zone redundant"),
        createDemoRow("Cognitive Services SKUs", subscriptionId, region, "OpenAI S0", "accounts", "SKU tier", "Standard", "", region === "westeurope" ? "preview" : "available", "Regional AI offer"),
        createDemoRow("App Service", subscriptionId, region, "sites", "sites", "Zones", 3, "zones", "available", "SupportsTags · SupportsLocation"),
        createDemoRow("AKS", subscriptionId, region, "managedClusters", "managedClusters", "Zones", 3, "zones", region === "eastus" ? "available" : "preview", "Managed clusters regional metadata"),
      );
    }
  }

  state.allRecords = demoRows.map(enrichRecord).sort(sortAvailabilityRecords);
  state.regionsScanned = regions.length;
  state.lastRefresh = new Date();
  elements.lastRefresh.textContent = `${formatDateTime(state.lastRefresh)} demo`;

  populateFilterOptions(state.allRecords);
  applyFilters();
  setStatus("Demo availability data loaded. Replace it with live ARM metadata when ready.", "good");
}

function createDemoRow(providerLabel, subscriptionId, region, name, resourceType, metricLabel, metricValue, unit, availability, notes) {
  return {
    providerId: providerLabel.toLowerCase().replace(/\s+/g, "-"),
    providerLabel,
    subscriptionId,
    region,
    name,
    resourceType,
    metricLabel,
    metricValue,
    unit,
    availability,
    notes,
    sourceType: "demo",
  };
}

function populateFilterOptions(records) {
  setSelectOptions(elements.providerFilter, ["all", ...uniqueValues(records.map((record) => record.providerLabel))], "All providers");
  setSelectOptions(
    elements.subscriptionFilter,
    ["all", ...uniqueValues(records.map((record) => record.subscriptionId))],
    "All scopes",
  );
  setSelectOptions(elements.regionFilter, ["all", ...uniqueValues(records.map((record) => record.region))], "All regions");
}

function applyFilters() {
  const searchTerm = elements.searchInput.value.trim().toLowerCase();
  const availability = elements.riskFilter.value;
  const provider = elements.providerFilter.value;
  const subscription = elements.subscriptionFilter.value;
  const region = elements.regionFilter.value;
  const onlyLimited = elements.atRiskToggle.checked;

  state.filteredRecords = state.allRecords.filter((record) => {
    if (availability !== "all" && record.availability !== availability) {
      return false;
    }

    if (provider !== "all" && record.providerLabel !== provider) {
      return false;
    }

    if (subscription !== "all" && record.subscriptionId !== subscription) {
      return false;
    }

    if (region !== "all" && record.region !== region) {
      return false;
    }

    if (onlyLimited && record.availability === "available") {
      return false;
    }

    if (searchTerm && !record.searchIndex.includes(searchTerm)) {
      return false;
    }

    return true;
  });

  renderSummary(state.filteredRecords, state.allRecords);
  renderPriorityList(state.filteredRecords);
  renderTable(state.filteredRecords);
}

function renderEmptySummary() {
  elements.summaryCards.innerHTML = [
    buildSummaryCard("Tracked offers", "0", "No availability data loaded yet"),
    buildSummaryCard("Available items", "0", "Region-ready offers and SKUs"),
    buildSummaryCard("Limited items", "0", "Restricted or preview items"),
    buildSummaryCard("Regions scanned", "0", "Physical Azure regions"),
  ].join("");
  elements.providerBreakdown.innerHTML = "<p class=\"empty-state\">Provider availability will appear after refresh.</p>";
}

function renderSummary(filteredRecords, allRecords = filteredRecords) {
  const availableCount = filteredRecords.filter((record) => record.availability === "available").length;
  const limitedCount = filteredRecords.filter((record) => record.availability !== "available").length;
  const distinctOffers = new Set(filteredRecords.map((record) => `${record.providerLabel}:${record.name}:${record.region}`)).size;

  elements.summaryCards.innerHTML = [
    buildSummaryCard("Tracked offers", String(distinctOffers), `${allRecords.length} total availability rows`),
    buildSummaryCard("Available items", String(availableCount), "Ready for new deployments"),
    buildSummaryCard("Limited items", String(limitedCount), "Restricted or preview-only items"),
    buildSummaryCard("Regions scanned", String(state.regionsScanned), "Physical Azure regions"),
  ].join("");

  renderProviderBreakdown(filteredRecords);
}

function renderProviderBreakdown(records) {
  if (records.length === 0) {
    elements.providerBreakdown.innerHTML = "<p class=\"empty-state\">No provider data matches the current filters.</p>";
    return;
  }

  const grouped = groupBy(records, (record) => record.providerLabel);
  elements.providerBreakdown.innerHTML = [...grouped.entries()]
    .map(([providerLabel, rows]) => {
      const availableCount = rows.filter((record) => record.availability === "available").length;
      const percent = rows.length ? Math.round((availableCount / rows.length) * 100) : 0;
      return `
        <article class="provider-card">
          <div class="provider-card-header">
            <strong>${escapeHtml(providerLabel)}</strong>
            <span>${percent}% ready</span>
          </div>
          <div class="provider-bar"><span style="width:${Math.min(percent, 100)}%"></span></div>
          <p class="summary-subtext">${rows.length} rows · ${availableCount} available</p>
        </article>
      `;
    })
    .join("");
}

function renderPriorityList(records) {
  const urgentRecords = records
    .filter((record) => record.availability !== "available")
    .sort(sortAvailabilityRecords)
    .slice(0, 6);

  if (urgentRecords.length === 0) {
    elements.priorityList.className = "priority-list empty-state";
    elements.priorityList.textContent = "No restricted or limited offers in the current view.";
    return;
  }

  elements.priorityList.className = "priority-list";
  elements.priorityList.innerHTML = urgentRecords
    .map(
      (record) => `
        <article class="priority-item">
          <div class="priority-topline">
            <strong>${escapeHtml(record.name)}</strong>
            <span class="risk-pill ${record.availability}">${capitalize(record.availability)}</span>
          </div>
          <div class="priority-meta">${escapeHtml(record.providerLabel)} · ${escapeHtml(record.resourceType)} · ${escapeHtml(record.region)}</div>
          <p class="priority-footnote">${escapeHtml(record.notes || `${record.metricLabel}: ${record.metricValue}`)}</p>
        </article>
      `,
    )
    .join("");
}

function renderTable(records) {
  elements.tableMeta.textContent = records.length
    ? `${records.length} rows shown`
    : state.allRecords.length
      ? "No rows match the current filters"
      : "No availability data loaded";

  if (records.length === 0) {
    elements.tableBody.innerHTML = `<tr><td colspan="9" class="empty-table">${state.allRecords.length ? "Adjust the filters to broaden the view." : "Refresh data or load the demo view to populate the dashboard."}</td></tr>`;
    return;
  }

  elements.tableBody.innerHTML = records
    .map(
      (record) => `
        <tr>
          <td><span class="risk-pill ${record.availability}">${capitalize(record.availability)}</span></td>
          <td>${escapeHtml(record.providerLabel)}</td>
          <td>${escapeHtml(record.name)}</td>
          <td>${escapeHtml(record.resourceType)}</td>
          <td>${escapeHtml(record.subscriptionId)}</td>
          <td>${escapeHtml(record.region)}</td>
          <td>${escapeHtml(record.metricLabel)}</td>
          <td>${escapeHtml(formatMetricValue(record.metricValue, record.unit))}</td>
          <td>${escapeHtml(record.notes || "")}</td>
        </tr>
      `,
    )
    .join("");
}

async function armGet(path, token) {
  const response = await fetch(path.startsWith("http") ? path : `${MANAGEMENT_ROOT}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    const detail = errorBody?.error?.message || errorBody?.message || response.statusText;
    throw new Error(`${response.status} ${detail}`.trim());
  }

  const payload = await response.json();
  if (payload.nextLink) {
    const nextPayload = await armGet(payload.nextLink, token);
    return {
      ...payload,
      value: [...(payload.value ?? []), ...(nextPayload.value ?? [])],
    };
  }

  return payload;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(tasks.length, 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  elements.refreshButton.disabled = isLoading;
  elements.demoButton.disabled = isLoading;
  elements.signInButton.disabled = isLoading || !elements.clientIdInput.value.trim();
  elements.signOutButton.disabled = isLoading || !state.authAccount;
}

function setStatus(message, tone = "neutral") {
  elements.statusBadge.textContent = message;
  elements.statusBadge.className = `status-badge ${tone}`;
}

function deriveDashboardStatus(records) {
  if (records.some((record) => record.availability === "restricted")) {
    return "bad";
  }

  if (records.some((record) => record.availability === "preview")) {
    return "warn";
  }

  return "good";
}

function getSelectedProviderIds() {
  return [...elements.providerOptions.querySelectorAll('input[type="checkbox"]:checked')].map(
    (checkbox) => checkbox.value,
  );
}

function getAuthSettings() {
  return {
    tenantId: elements.tenantInput.value.trim() || "organizations",
    clientId: elements.clientIdInput.value.trim(),
    redirectUri: getRedirectUri(),
  };
}

async function refreshAuthState() {
  const authSettings = getAuthSettings();
  elements.redirectUriInput.value = authSettings.redirectUri;

  if (!authSettings.clientId) {
    applyAuthState(null);
    elements.authHelper.textContent = "Set a tenant and SPA client ID to enable Microsoft Entra sign-in.";
    setLoading(state.loading);
    return;
  }

  try {
    const authState = await getAuthState(authSettings);
    applyAuthState(authState.account);
  } catch (error) {
    console.error(error);
    applyAuthState(null);
    elements.authHelper.textContent = "The app registration settings could not be initialized. Check the client ID, tenant, and redirect URI.";
  }

  setLoading(state.loading);
}

async function signInToAzure() {
  const authSettings = getAuthSettings();
  if (!authSettings.clientId) {
    setStatus("Provide a Microsoft Entra app registration client ID before signing in.", "warn");
    return;
  }

  setLoading(true);
  try {
    const authResult = await signIn(authSettings);
    applyAuthState(authResult.account);
    setStatus(`Signed in as ${formatAccountName(authResult.account)}.`, "good");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Sign-in failed.", "bad");
  } finally {
    setLoading(false);
  }
}

async function signOutFromAzure() {
  const authSettings = getAuthSettings();
  if (!authSettings.clientId || !state.authAccount) {
    applyAuthState(null);
    return;
  }

  setLoading(true);
  try {
    await signOut(authSettings);
    applyAuthState(null);
    setStatus("Signed out of Microsoft Entra.", "neutral");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Sign-out failed.", "bad");
  } finally {
    setLoading(false);
  }
}

function applyAuthState(account) {
  state.authAccount = account;

  if (account) {
    elements.accountLabel.textContent = formatAccountName(account);
    elements.authHelper.textContent = "Signed in. Refresh will acquire Azure Resource Manager tokens and regional availability metadata silently when possible.";
  } else {
    elements.accountLabel.textContent = "Not signed in";
    elements.authHelper.textContent = "Configure the tenant and client ID, then sign in to acquire Azure Resource Manager tokens with MSAL.";
  }

  setLoading(state.loading);
}

function formatAccountName(account) {
  return account.name || account.username || "Signed-in account";
}

function parseList(rawValue) {
  return rawValue
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function setSelectOptions(select, values, allLabel) {
  const currentValue = select.value;
  select.innerHTML = values
    .map((value, index) => {
      const label = index === 0 ? allLabel : value;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  if (values.includes(currentValue)) {
    select.value = currentValue;
  }
}

function buildSummaryCard(label, value, subtext) {
  return `
    <article class="summary-card">
      <span class="summary-label">${escapeHtml(label)}</span>
      <strong class="summary-value">${escapeHtml(value)}</strong>
      <div class="summary-subtext">${escapeHtml(subtext)}</div>
    </article>
  `;
}

function groupBy(items, keySelector) {
  const map = new Map();
  for (const item of items) {
    const key = keySelector(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

function uniqueValues(items) {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatMetricValue(value, unit) {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }
  return unit ? `${value} ${unit}` : String(value);
}

function normalizeRegion(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function severityFromAvailability(availability, existingSeverity = 1) {
  if (typeof existingSeverity === "number") {
    return existingSeverity;
  }
  if (availability === "restricted") {
    return 3;
  }
  if (availability === "preview") {
    return 2;
  }
  return 1;
}

function sortAvailabilityRecords(left, right) {
  return (
    right.severity - left.severity ||
    left.providerLabel.localeCompare(right.providerLabel) ||
    left.name.localeCompare(right.name) ||
    left.region.localeCompare(right.region)
  );
}