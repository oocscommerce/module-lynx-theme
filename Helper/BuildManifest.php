<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Helper;

use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Filesystem\DirectoryList;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Serialize\Serializer\Json;

/**
 * The Lynx themes and the enabled modules a theme build draws from
 */
class BuildManifest
{
    /**
     * Where a theme keeps the build root npm installs and Vite builds from
     */
    public const THEME_DIR = 'lynx';

    /**
     * Where a module ships its client sources and npm packages
     */
    public const MODULE_DIR = 'view/frontend/lynx/vue';

    /**
     * The meta-package lynx:theme:setup writes into a build root, and the hash npm install left in node_modules
     */
    public const META_FILE = '.lynx/package.json';

    public const INSTALLED_FILE = 'node_modules/.lynx-deps';

    private const AREA = 'frontend/';

    /**
     * Registrar, module list, directory list, file driver
     *
     * @param ComponentRegistrarInterface $registrar
     * @param ModuleListInterface $moduleList
     * @param DirectoryList $directoryList
     * @param FileDriver $fileDriver
     * @param Json $serializer
     */
    public function __construct(
        private readonly ComponentRegistrarInterface $registrar,
        private readonly ModuleListInterface $moduleList,
        private readonly DirectoryList $directoryList,
        private readonly FileDriver $fileDriver,
        private readonly Json $serializer,
    ) {
    }

    /**
     * Root
     *
     * @return string
     */
    public function root(): string
    {
        return rtrim($this->directoryList->getRoot(), '/');
    }

    /**
     * The themes set up for building: those whose build root lynx:theme:setup has written the meta-package into
     *
     * @return string[] Theme codes
     */
    public function selectedThemes(): array
    {
        return array_keys(array_filter(
            $this->lynxThemes(),
            fn (string $dir): bool => $this->fileDriver->isFile($dir . '/' . self::THEME_DIR . '/' . self::META_FILE)
        ));
    }

    /**
     * The package.json of a theme's build root, empty when there is none or it does not parse
     *
     * @param string $code
     * @return array
     */
    public function themePackage(string $code): array
    {
        $file = $this->themeBuildDir($code) . '/package.json';

        try {
            $package = $this->fileDriver->isFile($file)
                ? $this->serializer->unserialize($this->fileDriver->fileGetContents($file))
                : [];
        } catch (\InvalidArgumentException) {
            $package = [];
        }

        return \is_array($package) ? $package : [];
    }

    /**
     * The themes a theme inherits from, nearest ancestor first
     *
     * @param string $code
     * @return string[] Theme codes
     */
    public function parentChain(string $code): array
    {
        $themes = $this->frontendThemes();
        $chain = [];

        while (($code = $this->parentOf($code, $themes)) !== null) {
            // A theme.xml naming a theme that is not installed ends the chain, and so does one that points back into it
            if (!isset($themes[$code]) || \in_array($code, $chain, true)) {
                break;
            }

            $chain[] = $code;
        }

        return $chain;
    }

    /**
     * Parent Of
     *
     * @param string $code
     * @param array $themes
     * @return string|null
     */
    private function parentOf(string $code, array $themes): ?string
    {
        $file = ($themes[$code] ?? '') . '/theme.xml';

        if (!$this->fileDriver->isFile($file)) {
            return null;
        }

        $xml = simplexml_load_file($file);
        $parent = trim((string) ($xml->parent ?? ''));

        return $parent === '' ? null : self::AREA . $parent;
    }

    /**
     * Every registered frontend theme, Lynx or not, keyed by theme code
     *
     * @return array<string, string> Theme code to absolute path
     */
    public function frontendThemes(): array
    {
        $themes = [];

        foreach ($this->registrar->getPaths(ComponentRegistrar::THEME) as $code => $dir) {
            if (str_starts_with($code, self::AREA)) {
                $themes[$code] = $dir;
            }
        }

        ksort($themes);

        return $themes;
    }

    /**
     * The frontend themes that carry a build root
     *
     * @return array<string, string> Theme code to absolute path
     */
    public function lynxThemes(): array
    {
        return array_filter($this->frontendThemes(), fn (string $dir): bool => $this->isLynxTheme($dir));
    }

    /**
     * The one spelling the commands take: the theme code without its area, written the way module names are
     *
     * @param string $code
     * @return string
     */
    public function shortName(string $code): string
    {
        return str_replace('/', '_', substr($code, \strlen(self::AREA)));
    }

    /**
     * Match a name against the registered theme codes
     *
     * @param string $name
     * @return string|null
     */
    public function resolve(string $name): ?string
    {
        foreach (array_keys($this->frontendThemes()) as $code) {
            if ($this->shortName($code) === $name) {
                return $code;
            }
        }

        return null;
    }

    /**
     * Is Lynx Theme
     *
     * @param string $dir
     * @return bool
     */
    public function isLynxTheme(string $dir): bool
    {
        return $this->fileDriver->isFile($dir . '/' . self::THEME_DIR . '/package.json');
    }

    /**
     * Where npm and Vite run for a theme: its build root
     *
     * @param string $code
     * @return string|null
     */
    public function themeBuildDir(string $code): ?string
    {
        $dir = $this->frontendThemes()[$code] ?? null;

        return $dir === null ? null : $dir . '/' . self::THEME_DIR;
    }

    /**
     * Enabled modules only, with the path the component registry gives for each
     *
     * @return array<string, string> Module name to absolute path
     */
    public function enabledModulePaths(): array
    {
        $paths = $this->registrar->getPaths(ComponentRegistrar::MODULE);
        $enabled = [];

        foreach ($this->moduleList->getNames() as $module) {
            if (isset($paths[$module])) {
                $enabled[$module] = $paths[$module];
            }
        }

        return $enabled;
    }

    /**
     * The path both npm and Vite refer to a workspace by: relative to the project root, forward slashes
     *
     * @param string $path
     * @return string|null
     */
    public function relative(string $path): ?string
    {
        $path = rtrim($path, '/');
        $root = $this->root();

        if (!str_starts_with($path, $root . '/')) {
            return null;
        }

        return substr($path, \strlen($root) + 1);
    }
}
