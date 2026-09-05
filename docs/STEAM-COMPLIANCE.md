# Steamworks compliance and monetization research

> **Status:** Launch constraint and durable project knowledge
>
> **Last researched:** 2026-09-04 (America/Vancouver)
>
> **Scope:** Wishline's use of Steamworks wishlist reporting and the proposed
> paid hosted SaaS model. This is a technical and contractual risk assessment,
> not legal advice.

## Executive decision

No public Valve rule reviewed here expressly prohibits charging for a wishlist
analytics dashboard. However, Wishline must not launch as a paid hosted SaaS
that collects customers' Financial Web API keys until Valve confirms that exact
model in writing.

The unresolved issue is not charging by itself. It is a third-party SaaS
receiving, storing, and using another Steamworks partner's highly privileged
Financial Web API key.

Development with anonymous fixtures may continue. Testing with real credentials
must remain private, authorized by the credential owner, and follow the security
controls in `SECURITY.md`; such testing is not evidence that Valve has approved
the commercial model.

## Current Wishline integration

Wishline calls:

```text
GET https://partner.steam-api.com/
    IPartnerFinancialsService/GetAppWishlistReporting/v001/
```

The app currently:

- asks the authenticated workspace owner for an App ID and Financial Web API
  key;
- validates the pair by querying recent wishlist dates;
- encrypts the key with AES-256-GCM before storing it in D1;
- decrypts it only in the server runtime;
- sends it to Steam in the `x-webapi-key` header over HTTPS;
- requests only the configured App ID and rejects an unexpected App ID;
- returns normalized aggregate wishlist metrics rather than the credential or
  raw upstream response.

These are useful security controls, but they do not reduce the permissions of
the credential that the customer supplies.

## Findings from Valve's public documentation

### 1. The endpoint requires a Financial Web API key

Valve documents `GetAppWishlistReporting` under
`IPartnerFinancialsService` and requires a publisher key with Financial
permissions.

Source: [IPartnerFinancialsService interface](https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService?language=english)

### 2. The Financial Web API key is partner-wide, not App-ID-scoped

Valve states that the Financial API Group has no app or user limitations and
that its key can retrieve financial data for all applications in the partner
account. The `appid` supplied by Wishline limits the request Wishline makes; it
does not limit what a stolen or misused credential could request.

This makes the current onboarding message materially high-risk: a customer is
not providing a key "for one game" even though Wishline intentionally uses it
for only one game.

Source: [IPartnerFinancialsService interface](https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService?language=english)

### 3. Publisher keys are sensitive server credentials

Valve says publisher keys provide access to sensitive data and protected
methods, are intended for requests originating from secure publisher servers,
must be stored securely, must not be distributed with a game client, and should
be used over HTTPS. Valve also supports IP allowlists and warns that allowlists
do not replace proper key security.

Wishline's server-only handling and header transport are consistent with the
technical portions of this guidance. The public documentation does not clearly
say whether infrastructure operated by an unrelated paid SaaS qualifies as the
publisher's secure server or authorized service provider.

Sources:

- [Authentication using Web API keys](https://partner.steamgames.com/doc/webapi_overview/auth?l=english)
- [Web API overview](https://partner.steamgames.com/doc/webapi_overview)

### 4. Public Web API terms do not clearly authorize this B2B model

The public Steam Web API Terms of Use grant a license to present Steam Data to
end users for personal use. They also require the API key to remain
confidential, prohibit sharing it with third parties, make the license personal
and application-specific, require a privacy policy for nonpublic data, require
substantially equivalent "as is" disclaimers, prohibit suggesting Valve or
Steam endorsement, and state a general limit of 100,000 calls per day.

Those terms do not expressly prohibit charging a subscription. Nevertheless,
"personal use" and the restrictions on sharing keys create tension with a B2B
analytics service whose operator receives a customer's key.

There is also an applicability ambiguity: Valve's authentication documentation
explicitly places acceptance of these public terms in its **User Keys** section,
whereas Wishline uses a publisher Financial key. Publisher relationships are
also governed by the Steam Distribution Agreement and NDA accepted inside
Steamworks. Those complete agreements are not available in the public sources
reviewed here, so public documentation alone cannot establish permission.

Source: [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms)

### 5. Steam has an official mechanism for access between partners

Valve documents Application Management Sharing for trusted entities with an
existing relationship. Both parties need appropriate Steamworks agreements,
and financial view access must be explicitly granted. This demonstrates that
third-party access can exist, but it does not establish that collecting a
customer's unrestricted Financial API key through SaaS onboarding is allowed.

Source: [Application Management Sharing](https://partner.steamgames.com/doc/gettingstarted/managing_apps/sharing)

### 6. Wishlist API data supports intraday batch polling

Two Valve surfaces have different freshness behavior. The Steamworks historical
report excludes the current day and presents completed daily history. The API,
however, explicitly recommends querying both yesterday and today in GMT. Valve's
API launch announcement says recent wishlist data is updated regularly,
typically within a few hours, and a Valve staff reply says recent data is
generally available within an hour at the similar Wishlist API cadence.

This supports hourly polling of the current date, but not a strict real-time
claim. Heavy store activity may delay updates. Completed historical dates should
not be repeatedly queried because Valve warns that excessive requests may
trigger rate limiting or key restrictions.

Wishline performs one bounded onboarding backfill, then queries only yesterday
and today each hour. Changed current-day observations are stored; yesterday is
re-queried only while it is the immediately preceding date so the finalized
value replaces its provisional value.

Sources:

- [GetAppWishlistReporting documentation](https://partner.steamgames.com/doc/webapi/IPartnerFinancialsService?language=english)
- [Wishlist reporting](https://partner.steamgames.com/doc/marketing/wishlist/reporting)
- [Wishlist Data API announcement](https://steamcommunity.com/gid/103582791433666425/announcements/detail/499474120884358024)

## Risk assessment

| Area | Current assessment | Reason |
| --- | --- | --- |
| Charging for Wishline software | Not expressly prohibited in the public sources | The unresolved issue is credential/data handling, not the existence of a subscription price |
| Customer pastes Financial key into hosted Wishline | High / unresolved | The credential is partner-wide and Wishline becomes a third party holding it |
| Displaying the customer's own aggregate wishlist data privately | Lower risk, still contract-dependent | It is limited to the authorized customer, but publisher agreements still govern it |
| Selling or publishing Steam-derived datasets or cross-client benchmarks | Do not implement without separate permission | This goes beyond the narrow private dashboard purpose and may disclose confidential partner data |
| Implying official Valve/Steam affiliation | Prohibited | Public API terms forbid misleading endorsement or affiliation claims |
| Repeatedly querying historical dates | Operational compliance risk | Contrary to Valve's published polling guidance and needlessly consumes requests |
| Key compromise | Critical impact | A Financial key can expose data beyond the App ID configured in Wishline |

## Paid-production launch gate

All items below are required before paid production launch:

- [ ] Obtain written confirmation from Valve that the proposed hosted B2B SaaS
      may receive, store, and use each customer's Financial Web API key solely
      for `GetAppWishlistReporting`.
- [ ] Preserve Valve's response or support ticket reference in private company
      records. Record the decision and non-sensitive summary in this document.
- [ ] Have counsel review the applicable Steam Distribution Agreement, NDA,
      public API terms, customer terms, and privacy policy.
- [ ] Add customer Terms of Service and a Privacy Policy identifying data,
      credential storage, storage countries, subprocessors, retention, deletion,
      incident handling, and Valve's applicable disclaimers.
- [ ] Require the customer to confirm that they are authorized to provide the
      partner credential and data to Wishline.
- [ ] Add an explicit statement that Wishline is independent and is not
      affiliated with, sponsored by, or endorsed by Valve or Steam.
- [ ] Implement owner-facing disconnect, complete credential deletion, account
      deletion, and documented retention behavior.
- [ ] Use managed secret/key protection with rotation, access auditing, recovery,
      and a tested incident-response procedure.
- [ ] Require a stable outbound IP and customer-configured Steamworks IP
      allowlisting where the deployment permits it.
- [ ] Verify tenant isolation with automated integration tests.
- [x] Replace rolling-window refetching with one-time backfill and hourly
      yesterday/today polling plus last-known-good storage.
- [ ] Validate the hourly cadence for 24-48 hours with an authorized test game,
      add bounded retry/backoff, and establish per-workspace quotas.
- [ ] Ensure no logs, traces, analytics, error reports, backups, or support tools
      expose plaintext keys or raw sensitive responses.
- [ ] Establish a process to review Valve's terms and documentation periodically
      because Valve may change or terminate API access.

Stripe or other billing work must remain deferred until the Valve authorization
item is resolved. Completing only the technical controls does not clear the
contractual gate.

## Question to send Valve

Use a Steamworks Support ticket and, if appropriate, the contact address listed
in the Web API Terms. Do not include a real API key or customer data.

Suggested request:

> We are developing a paid B2B analytics service for Steamworks partners. Each
> customer would explicitly authorize our hosted backend to store their
> Financial Web API key encrypted at rest and use it only from an IP-allowlisted
> server to call
> `IPartnerFinancialsService/GetAppWishlistReporting` for App IDs they select.
> We would display only that customer's private aggregate wishlist metrics and
> would not sell, publish, benchmark, or share their Steam data. Is this model
> permitted under the Steam Distribution Agreement, Steamworks NDA, Web API
> terms, and publisher-key rules? If not, is there an approved authorization,
> OAuth, partner-sharing, or customer-hosted integration pattern we should use?

Ask Valve to clarify in particular:

1. whether a contracted SaaS backend may qualify as a secure publisher server;
2. whether the customer may disclose its Financial key to that processor;
3. whether a separate agreement, registration, or Steamworks partner account is
   required;
4. which branding, attribution, privacy, deletion, and disclaimer language is
   required;
5. whether the 100,000-call daily limit applies per Financial key, partner,
   source IP, or Wishline as an application.

## Safer fallback architectures

If Valve does not authorize hosted key custody, keep the product viable through
one of these designs:

1. **Customer-hosted connector:** the key remains in infrastructure controlled
   by the studio; the connector sends only approved normalized wishlist metrics
   to Wishline.
2. **Local connector:** a signed desktop/CLI tool retrieves and uploads only the
   selected aggregates after explicit customer action.
3. **CSV import:** the customer exports wishlist reporting from Steamworks and
   imports it into Wishline without providing a Financial key.
4. **Official partner sharing:** use only if Valve confirms that its documented
   partner-sharing workflow is appropriate for this service.

The customer-hosted connector gives the strongest credential boundary. CSV
import is the simplest low-risk path for an early paid product, though it loses
automatic synchronization.

## Maintenance rule

Anyone changing Steam endpoints, requested fields, authentication, storage,
hosting, polling, data export, public sharing, branding, or billing must review
this document first and update it in the same change when the facts or decision
change. Prefer primary Valve sources and record the review date.
