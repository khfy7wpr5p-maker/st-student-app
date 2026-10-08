import { createInviteActivationFlow } from "../auth/inviteActivationFlow.js";
import { parseInviteFragment, stripInviteFragment } from "../auth/inviteFragment.js";
import { createAccountServiceConfig } from "../config/accountServiceConfig.js";
import { createAccountServiceApiClient } from "../providers/accountService/accountServiceApiClient.js";
import { mountInviteActivation, renderInviteUnavailable } from "./mountInviteActivation.js";

export async function runInviteActivationIfPresent({
  root,
  authAdapter,
  fetchImpl = globalThis.fetch,
  historyObject = globalThis.history,
  locationObject = globalThis.location,
  environment,
} = {}) {
  const inviteToken = parseInviteFragment(locationObject?.hash);
  if (inviteToken === null) {
    return false;
  }

  stripInviteFragment({ historyObject, locationObject });

  const config = createAccountServiceConfig(environment);
  if (config.enabled !== true) {
    if (root !== null && typeof root === "object") {
      root.innerHTML = renderInviteUnavailable();
    }
    return true;
  }

  const apiClient = createAccountServiceApiClient({
    baseUrl: config.baseUrl,
    getIdToken: () => authAdapter.getIdToken(),
    fetchImpl,
  });
  const flow = createInviteActivationFlow({
    inviteToken,
    apiClient,
    authAdapter,
  });
  const mounted = mountInviteActivation({
    root,
    flow,
    onContinue() {
      locationObject?.reload?.();
    },
  });

  await mounted.start();
  return true;
}
