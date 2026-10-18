// Console Hopper — sign-in validity UI
//
// The banner across the top of the page once the sign-in has expired, and the
// page attributes that advertise the sign-in's validity to any companion
// extension. DOM only — no chrome.* and no jQuery — so it imports cleanly into
// the content script and unit-tests under jsdom (see test/dom.test.js). The
// validity window itself is computed by the pure helpers in util.js
// (samlTimesFrom / samlValidUntil).
//
// === Page interface (stable; other extensions may read these — keep them) ===
// Set on <html> (document.documentElement), alongside the existing
// `data-console-hopper`:
//
//   data-console-hopper-signin-until    ms since the epoch at which AWS stops
//                                        accepting this sign-in (the earlier of
//                                        the SAML response's NotOnOrAfter and
//                                        its IssueInstant + 4.5 min). Set once
//                                        on load; absent when the response
//                                        carries no times.
//   data-console-hopper-signin-expired  "1" once the clock has passed that
//                                        instant; absent before.
//   data-console-hopper-expiry-ui        "1" whenever Console Hopper is showing
//                                        its own expired-sign-in banner
//                                        (always, in 1.9.0) — the signal for a
//                                        companion extension to stand its own
//                                        copy down.
//
// Times and flags only; nothing from the assertion itself is exposed.

export const SIGNIN_UNTIL_ATTR = "data-console-hopper-signin-until";
export const SIGNIN_EXPIRED_ATTR = "data-console-hopper-signin-expired";
export const EXPIRY_UI_ATTR = "data-console-hopper-expiry-ui";

export const EXPIRED_BANNER_ID = "tm_signin_expired_banner";

// Banner copy. Deliberately says nothing about temporary keys or any companion
// add-on — Console Hopper owns this page and the store listing must not mention
// another extension.
const BANNER_TITLE = "This sign-in has expired.";
const BANNER_BODY =
  " AWS accepts a sign-in page for about 5 minutes, so new sign-ins from this" +
  " page will fail. Sessions you already have open still work. Sign in to AWS" +
  " again through your identity provider.";

// Build the controller for one page. `until` is the ms-since-epoch the sign-in
// stops being usable (null when the response carried no times); `idpOrigin` is
// a validated http(s) origin for the "Sign in again" link ("" for none). `now`
// is injectable so tests can move the clock.
export function createSigninExpiry({
  doc = typeof document !== "undefined" ? document : null,
  root = doc && doc.documentElement,
  body = doc && doc.body,
  until = null,
  idpOrigin = "",
  now = () => Date.now(),
} = {}) {
  const hasUntil = typeof until === "number" && Number.isFinite(until);

  // Publish the load-time facts straight away (the page interface above).
  // signin-until only when there is a real time to share; expiry-ui always, so
  // a companion extension knows to stand down even on a timeless response.
  if (root) {
    if (hasUntil) root.setAttribute(SIGNIN_UNTIL_ATTR, String(until));
    root.setAttribute(EXPIRY_UI_ATTR, "1");
  }

  const isExpired = () => hasUntil && now() >= until;

  let banner = null;
  let bannerDismissed = false;

  const buildBanner = () => {
    const el = doc.createElement("div");
    el.id = EXPIRED_BANNER_ID;
    el.setAttribute("role", "alert");

    // textContent throughout — none of this copy is HTML, and nothing from the
    // assertion reaches it, so there is no interpolation to escape.
    const text = doc.createElement("div");
    text.className = "tm_banner_text";
    const strong = doc.createElement("strong");
    strong.textContent = BANNER_TITLE;
    const rest = doc.createElement("span");
    rest.textContent = BANNER_BODY;
    text.append(strong, rest);
    el.appendChild(text);

    // A link back to the identity provider, when the referrer gave us a safe
    // one. No address in the label; no button at all when there is none.
    if (idpOrigin) {
      const again = doc.createElement("a");
      again.className = "tm_banner_action";
      again.href = idpOrigin;
      again.textContent = "Sign in again";
      el.appendChild(again);
    }

    const x = doc.createElement("button");
    x.type = "button";
    x.className = "tm_banner_x";
    x.setAttribute("aria-label", "Hide this message");
    x.title = "Hide this message";
    x.textContent = "×";
    x.addEventListener("click", (e) => {
      e.preventDefault();
      bannerDismissed = true;
      if (banner) banner.hidden = true;
    });
    el.appendChild(x);
    return el;
  };

  const showBanner = () => {
    if (bannerDismissed || !body) return;
    if (!banner) {
      banner = buildBanner();
      body.insertBefore(banner, body.firstChild);
    }
    banner.hidden = false;
  };

  const hideBanner = () => {
    if (banner) banner.hidden = true;
  };

  // The Sign In guard calls this: a dismissed banner comes back the moment a
  // click would have posted a sign-in the page can no longer make.
  const revealBanner = () => {
    bannerDismissed = false;
    showBanner();
  };

  // Run once on load and then every second until it expires. Returns whether
  // the sign-in is dead, so the caller can stop its interval once it is: the
  // banner and the expired attribute are the only things the tick drives.
  const tick = () => {
    const dead = isExpired();
    if (dead && root) root.setAttribute(SIGNIN_EXPIRED_ATTR, "1");
    if (dead) showBanner();
    else hideBanner();
    return dead;
  };

  return { tick, isExpired, revealBanner, bannerEl: () => banner };
}
