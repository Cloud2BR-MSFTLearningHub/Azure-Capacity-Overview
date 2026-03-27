import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.13.0/+esm";

const ARM_SCOPE = "https://management.azure.com/user_impersonation";

let cachedInstance;
let cachedSignature = "";

export function getRedirectUri() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export async function getAuthState(settings) {
  const instance = await getInstance(settings);
  return {
    account: getActiveAccount(instance),
  };
}

export async function signIn(settings) {
  const instance = await getInstance(settings);
  const response = await instance.loginPopup({
    scopes: [ARM_SCOPE],
    prompt: "select_account",
  });
  instance.setActiveAccount(response.account);

  return {
    account: response.account,
  };
}

export async function signOut(settings) {
  const instance = await getInstance(settings);
  const account = getActiveAccount(instance);

  if (!account) {
    return;
  }

  await instance.logoutPopup({
    account,
    mainWindowRedirectUri: getRedirectUri(),
    postLogoutRedirectUri: getRedirectUri(),
  });
}

export async function acquireArmToken(settings) {
  const instance = await getInstance(settings);
  let account = getActiveAccount(instance);

  if (!account) {
    const loginResult = await signIn(settings);
    account = loginResult.account;
  }

  try {
    const response = await instance.acquireTokenSilent({
      account,
      scopes: [ARM_SCOPE],
    });

    return {
      account: response.account,
      token: response.accessToken,
    };
  } catch (error) {
    if (isInteractionRequired(error)) {
      const response = await instance.acquireTokenPopup({
        account,
        scopes: [ARM_SCOPE],
      });

      instance.setActiveAccount(response.account);
      return {
        account: response.account,
        token: response.accessToken,
      };
    }

    throw error;
  }
}

async function getInstance(settings) {
  const signature = JSON.stringify([
    settings.clientId,
    settings.tenantId,
    settings.redirectUri,
  ]);

  if (!cachedInstance || cachedSignature !== signature) {
    cachedInstance = new PublicClientApplication({
      auth: {
        clientId: settings.clientId,
        authority: `https://login.microsoftonline.com/${settings.tenantId}`,
        redirectUri: settings.redirectUri,
        postLogoutRedirectUri: settings.redirectUri,
        navigateToLoginRequestUrl: false,
      },
      cache: {
        cacheLocation: "localStorage",
      },
    });
    cachedSignature = signature;

    if (typeof cachedInstance.initialize === "function") {
      await cachedInstance.initialize();
    }
  }

  if (typeof cachedInstance.handleRedirectPromise === "function") {
    const redirectResult = await cachedInstance.handleRedirectPromise();
    if (redirectResult?.account) {
      cachedInstance.setActiveAccount(redirectResult.account);
    }
  }

  const account = getActiveAccount(cachedInstance);
  if (account) {
    cachedInstance.setActiveAccount(account);
  }

  return cachedInstance;
}

function getActiveAccount(instance) {
  return instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
}

function isInteractionRequired(error) {
  return error instanceof InteractionRequiredAuthError || error?.errorCode === "interaction_required";
}