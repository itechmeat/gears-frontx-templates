# architecture

This directory holds the SDLC artifacts of the template families this repository publishes: what a family is meant to do, and how its templates fit together. One directory per family, plus `explorations/` for the decision-support documents a family's artifacts are written from.

```
workspace-templates/    the workspace template family: one shell, four screens
explorations/           decision-support documents, not SDLC artifacts
```

It exists because the FrontX ecosystem repository, [`gears-frontx`](https://github.com/constructorfabric/gears-frontx), names no specific template and specifies no template's internals. Architecture that is specific to a named template belongs to the repository that publishes that template, which is this one. The ecosystem decision that allocates it here is `cpt-frontx-adr-template-territory-traceability`.

Every ecosystem-level decision these documents build on - the source-spec syntax, the template manifest contract, the extension domains and the actions channel a template registers against - lives in `gears-frontx`, not here. Each document names those by their `cpt-` id and carries a short References note giving the file behind each id.

No `.cf-studio` validation runs in this repository, so nothing here is checked mechanically: no traceability scan, no artifact linting, no link check. Whether to adopt that tooling is an open question for the maintainers, and until it is settled these documents are kept consistent by review.
