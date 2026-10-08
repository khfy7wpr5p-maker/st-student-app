const ACCOUNT_MODES = new Set(["CREATE", "SIGN_IN"]);

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function frozenState(state) {
  return Object.freeze({ ...state });
}

function activationUnavailable() {
  return new Error("Student activation unavailable");
}

export function createInviteActivationFlow({
  inviteToken,
  apiClient,
  authAdapter,
} = {}) {
  const rawToken = requiredText(inviteToken, "inviteToken");

  if (
    typeof apiClient?.resolveInvitation !== "function" ||
    typeof apiClient?.acceptInvitation !== "function"
  ) {
    throw new TypeError("apiClient invitation seam is incomplete");
  }
  if (
    typeof authAdapter?.signIn !== "function" ||
    typeof authAdapter?.createAccount !== "function"
  ) {
    throw new TypeError("authAdapter invitation seam is incomplete");
  }

  let invitation = null;
  let authenticated = false;
  let state = frozenState({ phase: "NEW" });

  function getState() {
    return state;
  }

  async function resolve() {
    if (invitation !== null) {
      return state;
    }

    const result = await apiClient.resolveInvitation(rawToken);
    const accountMode = result?.accountMode;
    const email = requiredText(result?.email, "email");

    if (!ACCOUNT_MODES.has(accountMode)) {
      throw activationUnavailable();
    }

    invitation = Object.freeze({
      email,
      accountMode,
      displayNameOrNickname:
        typeof result?.studentDisplayNameOrNickname === "string" &&
        result.studentDisplayNameOrNickname.trim().length > 0
          ? result.studentDisplayNameOrNickname.trim()
          : null,
      expiresAt:
        typeof result?.expiresAt === "string" && result.expiresAt.trim().length > 0
          ? result.expiresAt.trim()
          : null,
    });

    state = frozenState({
      phase: "READY",
      ...invitation,
    });
    return state;
  }

  async function activate({ password } = {}) {
    if (invitation === null) {
      throw new Error("Invitation must be resolved before activation");
    }

    if (!authenticated) {
      const credentials = Object.freeze({
        email: invitation.email,
        password: requiredText(password, "password"),
      });

      if (invitation.accountMode === "CREATE") {
        await authAdapter.createAccount(credentials);
      } else {
        await authAdapter.signIn(credentials);
      }

      authenticated = true;
      state = frozenState({
        phase: "AUTHENTICATED_PENDING_ACTIVATION",
        ...invitation,
      });
    }

    let result;
    try {
      result = await apiClient.acceptInvitation(rawToken);
    } catch (error) {
      state = frozenState({
        phase: "AUTHENTICATED_PENDING_ACTIVATION",
        ...invitation,
      });
      throw error;
    }

    if (
      result?.relationshipState !== "ACTIVE" ||
      typeof result?.studentId !== "string" ||
      result.studentId.trim().length === 0
    ) {
      state = frozenState({
        phase: "AUTHENTICATED_PENDING_ACTIVATION",
        ...invitation,
      });
      throw activationUnavailable();
    }

    state = frozenState({
      phase: "ACTIVE",
      ...invitation,
      accountStudentId: result.studentId.trim(),
      relationshipState: "ACTIVE",
    });
    return state;
  }

  return Object.freeze({
    resolve,
    activate,
    getState,
  });
}
