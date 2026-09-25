# architecture

This directory holds the SDLC artifacts of the templates this repository publishes: what a template or a family of templates is meant to do, and how its templates fit together. One directory per family, or per template when a template stands alone - a feature such as a calendar is one template, its own npm package and its app included - plus `explorations/` for the decision-support documents those artifacts are written from.

```
workspace-templates/    the workspace template family: one shell, four screen features
explorations/           decision-support documents, not SDLC artifacts
```

The placement rules these documents follow: the ecosystem repository holds framework-level libraries only, and a concrete feature is template territory, published from here. A template may use the ecosystem's libraries, `@gears-frontx/ui-kit` included, and a generic component it needs that the kit lacks is added to the kit in the ecosystem repository. A template may carry its own npm package, used by that template and by no other template. Templates spread by copy: a project gets a copy of a template's content and may edit it, while packages are installed as published and not edited, so a vendor that needs a different kit or different logic forks the template. Alternative templates of the same kind, sibling templates, may be published side by side for a project to choose from. Each template carries its manifest, `frontx-template.json`, which declares the files it owns and its metadata, and it may ship its own AI skills and guidelines for working with and evolving it. A feature template stays separate from the microfrontend wrapper: `template-mfe` wraps it into a microfrontend, or a project renders it as a plain React component.

This directory exists here because the FrontX ecosystem repository, [`gears-frontx`](https://github.com/constructorfabric/gears-frontx), names no specific template and specifies no template's internals. Architecture that is specific to a named template belongs to the repository that publishes that template, which is this one. The ecosystem decision that allocates it here is `cpt-frontx-adr-template-territory-traceability`.

Every ecosystem-level decision these documents build on - the source-spec syntax, the template manifest contract, the extension domains and the actions channel a template registers against - lives in `gears-frontx`, not here. Each document names those by their `cpt-` id and carries a short References note giving the file behind each id.

No `.cf-studio` validation runs in this repository, so nothing here is checked mechanically: no traceability scan, no artifact linting, no link check. Whether to adopt that tooling is an open question for the maintainers, and until it is settled these documents are kept consistent by review.
