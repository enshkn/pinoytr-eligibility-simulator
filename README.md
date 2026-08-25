# Eligibility Simulator

Vendor-neutral, browser-only pre-assessment for general Turkish citizenship and long-term residence duration requirements. The interface is available in Turkish, English, and Tagalog.

## Run locally

```sh
npm install
npm run dev
```

## Verify and build

```sh
npm run check
```

The portable production output is written to `dist/`. It can be served by any ordinary static host or web server. No backend, database, or provider-specific runtime is required.

## Runtime configuration

Edit `config.json` after deployment when needed:

- `analyticsScriptUrl`: optional privacy-respecting page-view analytics script. Empty disables analytics.
- `consultationUrl`: optional consultation destination.
- `consultationText`: optional Turkish, English, and Tagalog link text. The action is hidden unless both a URL and current-language text exist.

Do not configure analytics that captures form values, permit dates, checklist answers, or assessment results.

## Ghost iframe

Add this to a Ghost page HTML card:

```html
<iframe
  id="eligibility-simulator"
  src="https://simulator.example.com/"
  title="Residence and citizenship eligibility simulator"
  width="100%"
  style="border:0;min-height:720px"
></iframe>

<script>
  window.addEventListener("message", function (event) {
    if (event.origin !== "https://simulator.example.com") return;
    if (event.data?.type !== "pinoytr:resize") return;
    document.getElementById("eligibility-simulator").style.height =
      Math.max(720, event.data.height) + "px";
  });
</script>
```

Replace `https://simulator.example.com` with the actual HTTPS origin. The application sends only its document height, never form content.

## Privacy and legal scope

Inputs remain in browser memory and disappear on reload or close. The tool does not collect entry-exit history and does not provide legal advice or an official application decision. Rules were last reviewed against the linked primary sources on 25 August 2026.
