"use client";

// WhatsApp Embedded Signup — the Facebook JS SDK popup that lets a tenant
// connect their OWN WhatsApp Business number, as opposed to the redirect
// OAuth the other six channels use (see lib/api.ts's startOAuth). The popup
// hands back two independent things that both have to arrive before the
// backend can finish the connection:
//   - an auth `code`, via FB.login's own callback
//   - the waba_id/phone_number_id the user picked or created inside the
//     popup, via `message` events Meta posts from within it
// There's no guaranteed order between the two.

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FB_MESSAGE_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];
const SIGNUP_TIMEOUT_MS = 5 * 60 * 1000;

let sdkPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: false, xfbml: false, version: "v21.0" });
      resolve();
    };
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
  return sdkPromise;
}

export interface EmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

export function launchWhatsAppEmbeddedSignup(appId: string, configId: string): Promise<EmbeddedSignupResult> {
  return new Promise((resolve, reject) => {
    let code: string | null = null;
    let wabaId: string | null = null;
    let phoneNumberId: string | null = null;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeoutId);
    };

    const settleResolve = () => {
      if (settled || !code || !wabaId || !phoneNumberId) return;
      settled = true;
      cleanup();
      resolve({ code, wabaId, phoneNumberId });
    };

    const settleReject = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    function onMessage(event: MessageEvent) {
      if (!FB_MESSAGE_ORIGINS.includes(event.origin)) return;
      let data: { type?: string; event?: string; data?: Record<string, string> };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        wabaId = data.data?.waba_id ?? wabaId;
        phoneNumberId = data.data?.phone_number_id ?? phoneNumberId;
        settleResolve();
      } else if (data.event === "CANCEL") {
        settleReject(
          data.data?.current_step ? `Connection cancelled at "${data.data.current_step}".` : "Connection cancelled."
        );
      } else if (data.event === "ERROR") {
        settleReject(data.data?.error_message || "WhatsApp connection failed.");
      }
    }

    timeoutId = setTimeout(() => settleReject("Timed out waiting for WhatsApp to finish connecting."), SIGNUP_TIMEOUT_MS);
    window.addEventListener("message", onMessage);

    loadFacebookSdk(appId)
      .then(() => {
        window.FB!.login(
          (response) => {
            if (response.authResponse?.code) {
              code = response.authResponse.code;
              settleResolve();
            } else {
              settleReject("WhatsApp sign-in was closed before completing.");
            }
          },
          {
            config_id: configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
          }
        );
      })
      .catch(() => settleReject("Could not load the Facebook SDK."));
  });
}
