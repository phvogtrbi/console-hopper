// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { $, coerceData } from "../src/content/dom.js";
import { createSigninExpiry } from "../src/content/signin-expiry.js";
import {
  samlTimesFrom,
  samlValidUntil,
  decodeSamlResponse,
  SAML_FRESH_MS,
} from "../src/content/util.js";

describe("$ selection", () => {
  it("selects, indexes array-like, and reports length", () => {
    document.body.innerHTML = `<div id="a" class="box"></div><div class="box"></div>`;
    expect($(".box").length).toBe(2);
    expect($("#a")[0]).toBe(document.getElementById("a"));
    expect($(".missing").length).toBe(0);
  });

  it("iterates with jQuery (index, element) semantics", () => {
    document.body.innerHTML = `<i id="a"></i><i id="b"></i>`;
    const seen = [];
    $("i").each(function (idx) {
      seen.push(idx + ":" + this.id);
    });
    expect(seen).toEqual(["0:a", "1:b"]);
    expect(
      $("i")
        .map(function () {
          return this.id;
        })
        .get()
    ).toEqual(["a", "b"]);
  });
});

describe("$ classes / attrs / props", () => {
  it("adds, toggles (with state), and tests classes", () => {
    document.body.innerHTML = `<div id="a"></div>`;
    $("#a").addClass("x y").toggleClass("z", true).toggleClass("y");
    expect($("#a").hasClass("x")).toBe(true);
    expect($("#a").hasClass("z")).toBe(true);
    expect($("#a").hasClass("y")).toBe(false);
  });

  it("gets/sets attr, removeAttr, and prop", () => {
    document.body.innerHTML = `<input id="i"><input id="c" type="checkbox">`;
    $("#i").attr("placeholder", "hi");
    expect($("#i").attr("placeholder")).toBe("hi");
    $("#i").removeAttr("placeholder");
    expect($("#i").attr("placeholder")).toBe(null);
    $("#c").prop("checked", true);
    expect($("#c").prop("checked")).toBe(true);
  });
});

describe("coerceData / .data()", () => {
  it("coerces data-* values the way jQuery does", () => {
    expect(coerceData("123456789012")).toBe(123456789012);
    expect(coerceData("true")).toBe(true);
    expect(coerceData("false")).toBe(false);
    expect(coerceData("arn:aws:iam::x")).toBe("arn:aws:iam::x");
    expect(coerceData(null)).toBe(undefined);
  });

  it("reads data-* attributes through .data()", () => {
    document.body.innerHTML = `<button data-role-arn="arn:x" data-num="42"></button>`;
    expect($("button").data("role-arn")).toBe("arn:x");
    expect($("button").data("num")).toBe(42);
  });
});

describe("$ content", () => {
  it("gets/sets val, escapes text, and sets html markup", () => {
    document.body.innerHTML = `<input id="i"><span id="s"></span>`;
    $("#i").val("hello");
    expect($("#i").val()).toBe("hello");
    $("#s").text("<b>x</b>");
    expect($("#s")[0].textContent).toBe("<b>x</b>");
    expect($("#s")[0].querySelector("b")).toBe(null);
    $("#s").html("<b>x</b>");
    expect($("#s")[0].querySelector("b")).not.toBe(null);
  });
});

describe("$ insertion", () => {
  it("appends strings and arrays of HTML, prepends in order, appendTo, before", () => {
    document.body.innerHTML = `<ul id="list"></ul>`;
    $("#list").append("<li class='item'>1</li>");
    $("#list").append(["<li class='item'>2</li>", "<li class='item'>3</li>"]);
    $("#list").prepend("<li class='item'>0</li>");
    expect($("#list .item").length).toBe(4);
    expect($("#list").children()[0].textContent).toBe("0");

    const created = $("<input type='hidden' name='r'>").appendTo($("#list"));
    expect(created.attr("name")).toBe("r");
    expect($("#list input[name=r]").length).toBe(1);

    $("#list .item").first().before("<li class='pre'>P</li>");
    expect($("#list li")[0].className).toBe("pre");
  });
});

describe("$ traversal", () => {
  it("finds closest, filters (fn/sel), not, children().not().first(), prevAll().first()", () => {
    document.body.innerHTML = `<div id="c"><span class="t" data-v="1"></span><span class="t" data-v="2"></span><a class="x"></a></div>`;
    expect($(".t").eq(1).closest("#c")[0]).toBe(document.getElementById("c"));
    expect(
      $(".t").filter(function () {
        return this.dataset.v === "2";
      }).length
    ).toBe(1);
    expect($("#c span,#c a").filter(".t").length).toBe(2);
    expect($("#c span,#c a").not(".t").length).toBe(1);
    expect($("#c").children().not(".t").first()[0].tagName).toBe("A");
    expect($(".x").prevAll(".t").first().data("v")).toBe(2);
  });
});

describe("$ css / show / hide", () => {
  it("show() does not clobber an explicit display, hide() sets none", () => {
    document.body.innerHTML = `<div id="m"></div>`;
    $("#m").css("display", "flex").show();
    expect($("#m")[0].style.display).toBe("flex");
    expect($("#m").css("display")).toBe("flex");
    $("#m").css("display", "none").hide();
    expect($("#m")[0].style.display).toBe("none");
  });
});

describe("$ events", () => {
  it("delegates with this=matched element and honors `return false`", () => {
    document.body.innerHTML = `<div id="root"><button class="btn"><i class="ic"></i></button></div>`;
    let clicked = null;
    $("#root").on("click", ".btn", function () {
      clicked = this.className;
      return false;
    });
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    const notPrevented = $("#root .ic")[0].dispatchEvent(evt);
    expect(clicked).toBe("btn");
    expect(notPrevented).toBe(false); // return false -> preventDefault
  });

  it("triggers a direct input handler and forwards $.Event modifier keys", () => {
    document.body.innerHTML = `<input id="q"><div id="r"><button class="b"></button></div>`;
    let typed = 0;
    $("#q").on("input", () => {
      typed++;
    });
    $("#q").trigger("input");
    expect(typed).toBe(1);

    let meta = null;
    $("#r").on("click", ".b", (e) => {
      meta = e.metaKey;
    });
    $("#r .b").trigger($.Event("click", { metaKey: true }));
    expect(meta).toBe(true);
  });
});

describe("$ removal / effects", () => {
  it("empties, removes, and fires the fadeOut callback", async () => {
    document.body.innerHTML = `<div id="g"><b></b><b></b></div><div id="r"></div>`;
    $("#g").empty();
    expect($("#g")[0].children.length).toBe(0);
    $("#r").remove();
    expect(document.getElementById("r")).toBe(null);
    await new Promise((resolve) => $("#g").fadeOut(5, resolve));
    expect(true).toBe(true);
  });
});

describe("samlTimesFrom (jsdom DOMParser)", () => {
  const xml = (issue, noa) => `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" IssueInstant="${issue}">
  <saml:Assertion IssueInstant="${issue}">
    <saml:Subject><saml:SubjectConfirmation><saml:SubjectConfirmationData NotOnOrAfter="${noa}"/></saml:SubjectConfirmation></saml:Subject>
  </saml:Assertion>
</samlp:Response>`;

  it("reads IssueInstant and NotOnOrAfter", () => {
    const t = samlTimesFrom(
      xml("2026-10-18T12:00:00Z", "2026-10-18T12:10:00Z")
    );
    expect(t.issueInstant).toBe(Date.parse("2026-10-18T12:00:00Z"));
    expect(t.notOnOrAfter).toBe(Date.parse("2026-10-18T12:10:00Z"));
  });

  it("keeps the smallest NotOnOrAfter across several SubjectConfirmationData", () => {
    const multi = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" IssueInstant="2026-10-18T12:00:00Z">
      <saml:SubjectConfirmationData NotOnOrAfter="2026-10-18T12:09:00Z"/>
      <saml:SubjectConfirmationData NotOnOrAfter="2026-10-18T12:05:00Z"/>
    </samlp:Response>`;
    expect(samlTimesFrom(multi).notOnOrAfter).toBe(
      Date.parse("2026-10-18T12:05:00Z")
    );
  });

  it("returns nulls for garbage, and composes with decode + validUntil", () => {
    expect(samlTimesFrom("not xml <<<")).toEqual({
      issueInstant: null,
      notOnOrAfter: null,
    });
    const text = xml("2026-10-18T12:00:00Z", "2026-10-18T12:10:00Z");
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    expect(samlValidUntil(samlTimesFrom(decodeSamlResponse(b64)))).toBe(
      Date.parse("2026-10-18T12:00:00Z") + SAML_FRESH_MS
    );
  });
});

describe("createSigninExpiry", () => {
  const UNTIL = 1_000_000; // arbitrary epoch ms
  const freshRoot = () => document.createElement("html");
  const freshBody = () => document.createElement("body");
  const UNTIL_ATTR = "data-console-hopper-signin-until";
  const EXPIRED_ATTR = "data-console-hopper-signin-expired";
  const UI_ATTR = "data-console-hopper-expiry-ui";

  it("publishes signin-until and expiry-ui on load; signin-expired stays absent before expiry", () => {
    const root = freshRoot();
    const ctl = createSigninExpiry({
      doc: document,
      root,
      body: freshBody(),
      until: UNTIL,
      now: () => UNTIL - 5000,
    });
    expect(root.getAttribute(UNTIL_ATTR)).toBe(String(UNTIL));
    expect(root.getAttribute(UI_ATTR)).toBe("1");
    expect(root.hasAttribute(EXPIRED_ATTR)).toBe(false);
    expect(ctl.isExpired()).toBe(false);
    ctl.tick();
    expect(root.hasAttribute(EXPIRED_ATTR)).toBe(false);
  });

  it("sets signin-expired once the clock reaches until", () => {
    const root = freshRoot();
    let clock = UNTIL - 1000;
    const ctl = createSigninExpiry({
      doc: document,
      root,
      body: freshBody(),
      until: UNTIL,
      now: () => clock,
    });
    ctl.tick();
    expect(root.hasAttribute(EXPIRED_ATTR)).toBe(false);
    clock = UNTIL;
    ctl.tick();
    expect(root.getAttribute(EXPIRED_ATTR)).toBe("1");
    expect(ctl.isExpired()).toBe(true);
  });

  it("omits signin-until for a timeless response and never expires", () => {
    const root = freshRoot();
    const ctl = createSigninExpiry({
      doc: document,
      root,
      body: freshBody(),
      until: null,
      now: () => 9_999_999,
    });
    expect(root.hasAttribute(UNTIL_ATTR)).toBe(false);
    expect(root.getAttribute(UI_ATTR)).toBe("1");
    expect(ctl.isExpired()).toBe(false);
    ctl.tick();
    expect(root.hasAttribute(EXPIRED_ATTR)).toBe(false);
  });

  it("shows the banner at expiry: first child of body, role=alert, no button, no key/add-on wording", () => {
    const body = freshBody();
    let clock = UNTIL - 1000;
    const ctl = createSigninExpiry({
      doc: document,
      root: freshRoot(),
      body,
      until: UNTIL,
      now: () => clock,
    });
    ctl.tick();
    expect(ctl.bannerEl()).toBeNull();

    clock = UNTIL;
    ctl.tick();
    const banner = body.querySelector("#tm_signin_expired_banner");
    expect(banner).not.toBeNull();
    expect(banner.hidden).toBe(false);
    expect(banner.getAttribute("role")).toBe("alert");
    expect(body.firstChild).toBe(banner);
    // No "Sign in again" link in 1.9.1 — a referrer origin can be unreachable.
    expect(banner.querySelector(".tm_banner_action")).toBeNull();
    expect(banner.querySelector("a")).toBeNull();
    const copy = banner.textContent.toLowerCase();
    expect(copy).toContain("this sign-in has expired");
    expect(copy).not.toContain("5 minutes");
    expect(copy).not.toContain("key");
    expect(copy).not.toContain("add-on");
  });

  it("the × hides the banner for the rest of the page's life", () => {
    const body = freshBody();
    const ctl = createSigninExpiry({
      doc: document,
      root: freshRoot(),
      body,
      until: UNTIL,
      now: () => UNTIL,
    });
    ctl.tick();
    const banner = body.querySelector("#tm_signin_expired_banner");
    banner.querySelector(".tm_banner_x").click();
    expect(banner.hidden).toBe(true);
    ctl.tick();
    expect(banner.hidden).toBe(true);
  });

  it("the Sign In guard reveals a dismissed banner again", () => {
    const body = freshBody();
    const ctl = createSigninExpiry({
      doc: document,
      root: freshRoot(),
      body,
      until: UNTIL,
      now: () => UNTIL,
    });
    ctl.tick();
    const banner = body.querySelector("#tm_signin_expired_banner");
    banner.querySelector(".tm_banner_x").click();
    expect(banner.hidden).toBe(true);
    ctl.revealBanner();
    expect(banner.hidden).toBe(false);
  });
});
