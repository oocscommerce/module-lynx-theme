# Lynx Theme

`oocscommerce/module-lynx-theme`

The foundation of the Lynx storefront: page shell, theme build and theme settings.

## Features

- `lynx_` layout handles, so Lynx pages read only their own layout files
- Theme build kit and commands: `lynx:theme:setup`, `lynx:static:deploy`, `lynx:static:test`, `lynx:theme:create`
- Page Fallback: render chosen pages with a Magento theme instead of Lynx
- Email Theme: the Magento theme emails of a Lynx store render with
- Accessibility: skip link, focus management, keyboard friendly drawers and forms

## Installation

Part of [Lynx](https://docs.oocscommerce.com/lynx/), installed with the metapackage:

```bash
composer require oocscommerce/magento2-lynx-community
```

See [Installation](https://docs.oocscommerce.com/lynx/developer/installation) for the full setup.

## Dependencies

- [`oocscommerce/module-lynx-component`](https://github.com/oocscommerce/module-lynx-component)
- [`oocscommerce/module-lynx-inertia`](https://github.com/oocscommerce/module-lynx-inertia)
- [`oocscommerce/module-lynx-page-builder`](https://github.com/oocscommerce/module-lynx-page-builder)
- [`oocscommerce/module-lynx-theme-component`](https://github.com/oocscommerce/module-lynx-theme-component)

## Documentation

https://docs.oocscommerce.com/lynx/

Building on Lynx with Claude Code: the [Lynx skills](https://github.com/oocscommerce/claude-skills) teach it to write components, providers, checkout methods and more.

## Community

Questions, ideas and help: join [Lynx on Slack](https://join.slack.com/t/lynxmagento/shared_invite/zt-4dd3wdz3k-DILaGAowU_p3nevNLJ1gbw).

## License

[OSL-3.0](LICENSE.txt) or [AFL-3.0](LICENSE_AFL.txt).
