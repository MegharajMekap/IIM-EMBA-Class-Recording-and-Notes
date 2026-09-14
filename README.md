# IIM-EMBA-Class-Recording-and-Notes

## Adding a recording

Instead of hand-editing the `RECORDINGS` array in `index.html`, run:

```
npm run add-recording
```

It prompts for the session details, computes `duration` from the start/end
time, and appends a correctly formatted entry.

## Validating data

Checks that every `thumb` path exists on disk and that every `url` resolves
(flags a hard failure on 404s, warns on other statuses since Drive/Zoom
links can return non-200s even when working, e.g. permission prompts):

```
npm run validate            # schema + thumb files + live URL checks
npm run validate:offline    # schema + thumb files only, no network calls
```

This also runs automatically in CI on every push/PR to `main` and weekly on
a schedule, to catch links that go dead after the fact.