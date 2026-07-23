/**
 * Meta Facebook JS SDK loader + WhatsApp Embedded Signup launcher.
 * Safe to call multiple times; SDK is loaded once.
 */

let sdkPromise = null;

export function loadFacebookSdk(appId, graphVersion = 'v21.0') {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.FB && window.__autom8FbInited) {
    return Promise.resolve(window.FB);
  }
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const version = String(graphVersion || 'v21.0').replace(/^v?/, 'v');

    window.fbAsyncInit = function fbAsyncInit() {
      try {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: false,
          version,
        });
        window.__autom8FbInited = true;
        resolve(window.FB);
      } catch (err) {
        reject(err);
      }
    };

    if (document.getElementById('facebook-jssdk')) {
      if (window.FB) {
        window.FB.init({ appId, cookie: true, xfbml: false, version });
        window.__autom8FbInited = true;
        resolve(window.FB);
      }
      return;
    }

    const js = document.createElement('script');
    js.id = 'facebook-jssdk';
    js.async = true;
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    js.onerror = () => reject(new Error('Failed to load Facebook SDK'));
    document.body.appendChild(js);
  });

  return sdkPromise;
}

function parseSessionPayload(raw) {
  if (!raw || raw.type !== 'WA_EMBEDDED_SIGNUP') return null;
  return raw;
}

/**
 * Launch WhatsApp Embedded Signup.
 * Waits for both the OAuth code (FB.login) and WA_EMBEDDED_SIGNUP sessionInfo.
 * Resolves with { code, waba_id, phone_number_id, display_phone_number }.
 */
export function launchWhatsAppEmbeddedSignup({ configId, solutionId }) {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK not loaded'));
      return;
    }

    let code = null;
    let sessionInfo = null;
    let settled = false;
    let waitTimer = null;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (waitTimer) clearTimeout(waitTimer);
    };

    const tryFinish = () => {
      if (settled) return;
      if (!code || !sessionInfo) return;
      settled = true;
      cleanup();
      resolve({
        code,
        waba_id: sessionInfo.waba_id,
        phone_number_id: sessionInfo.phone_number_id,
        display_phone_number: sessionInfo.display_phone_number,
      });
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onMessage = (event) => {
      let raw = event?.data;
      try {
        if (typeof raw === 'string') raw = JSON.parse(raw);
      } catch {
        return;
      }
      const payload = parseSessionPayload(raw);
      if (!payload) return;

      if (
        payload.event === 'FINISH'
        || payload.event === 'FINISH_ONLY_WABA'
        || payload.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
      ) {
        sessionInfo = {
          waba_id: payload.data?.waba_id || payload.data?.wabaId || null,
          phone_number_id: payload.data?.phone_number_id || payload.data?.phoneNumberId || null,
          display_phone_number:
            payload.data?.display_phone_number
            || payload.data?.phone_number
            || payload.data?.displayPhoneNumber
            || null,
        };
        tryFinish();
      } else if (payload.event === 'CANCEL' || payload.event === 'error') {
        fail(new Error(payload.data?.error_message || 'Embedded Signup was cancelled'));
      }
    };

    window.addEventListener('message', onMessage);

    const extras = {
      setup: {},
      featureType: '',
      sessionInfoVersion: '3',
    };
    if (solutionId) {
      extras.setup.solutionID = solutionId;
    }

    window.FB.login(
      (response) => {
        if (!response?.authResponse?.code) {
          fail(new Error(
            response?.status === 'unknown'
              ? 'Login cancelled or not fully authorized'
              : 'No authorization code returned from Meta',
          ));
          return;
        }
        code = response.authResponse.code;
        tryFinish();
        // Session postMessage can arrive slightly after FB.login callback
        if (!sessionInfo && !settled) {
          waitTimer = setTimeout(() => {
            if (!sessionInfo) {
              fail(new Error('Signup finished but WABA / Phone Number ID was missing. Try again.'));
            }
          }, 8000);
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras,
      },
    );
  });
}
