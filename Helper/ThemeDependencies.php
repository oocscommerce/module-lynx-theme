<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Helper;

use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Serialize\Serializer\Json;

/**
 * The meta-package of a theme's build root: the npm packages of the kit and the enabled modules
 */
class ThemeDependencies
{
    /**
     * The name of the meta-package, the workspace .lynx of the theme's package.json
     */
    public const PACKAGE = 'lynx-deps';

    private const KIT_MODULE = 'OOCS_LynxTheme';

    /**
     * Manifest, file driver, serializer
     *
     * @param BuildManifest $manifest
     * @param FileDriver $fileDriver
     * @param Json $serializer
     */
    public function __construct(
        private readonly BuildManifest $manifest,
        private readonly FileDriver $fileDriver,
        private readonly Json $serializer,
    ) {
    }

    /**
     * The meta-package of a theme as file content
     *
     * @param string $code
     * @return string
     * @throws \RuntimeException When the kit is missing or two sources pin a package differently
     */
    public function generate(string $code): string
    {
        $lynxDir = (string) $this->manifest->themeBuildDir($code);
        $sub = BuildManifest::MODULE_DIR;
        $modulePaths = $this->manifest->enabledModulePaths();
        $kitDir = ($modulePaths[self::KIT_MODULE] ?? '') . '/' . $sub;
        if (!$this->fileDriver->isFile($kitDir . '/package.json')) {
            throw new \RuntimeException(\sprintf('%s is not enabled, or ships no kit.', self::KIT_MODULE));
        }

        $dependencies = [];
        $owners = [];
        $modules = [];
        foreach ($modulePaths as $module => $dir) {
            if ($this->fileDriver->isDirectory($dir . '/' . $sub . '/src')) {
                $modules[$module] = $this->relativePath($lynxDir, $dir);
            }
            $file = $dir . '/' . $sub . '/package.json';
            if ($this->fileDriver->isFile($file)) {
                $this->collect($this->packages($file), $module, $dependencies, $owners);
            }
        }

        // The theme's own packages may not pin one of these differently: npm would nest one of the two
        $own = $this->packages($lynxDir . '/package.json');
        $this->collect($own, $this->display($lynxDir) . '/package.json', $dependencies, $owners);
        $dependencies = array_diff_key($dependencies, $own);

        $kit = $this->serializer->unserialize($this->fileDriver->fileGetContents($kitDir . '/package.json'));
        $dependencies[(string) $kit['name']] = 'file:' . $this->relativePath($lynxDir . '/.lynx', $kitDir);
        ksort($dependencies);
        ksort($modules);

        $parents = [];
        $themes = $this->manifest->frontendThemes();
        foreach ($this->manifest->parentChain($code) as $parent) {
            $parents[] = $this->relativePath($lynxDir, $themes[$parent]);
        }

        // The version moves with the list and the kit's commands, which npm links only when it installs
        $hash = sha1($this->serializer->serialize([$dependencies, $kit['bin'] ?? []]));

        return $this->encode([
            'name' => self::PACKAGE,
            'version' => '0.0.0-' . substr($hash, 0, 12),
            'private' => true,
            'description' => 'Written by bin/magento lynx:theme:setup, do not edit',
            'dependencies' => $dependencies,
            'lynx' => [
                'modules' => $modules ?: new \stdClass(),
                'parents' => $parents,
            ],
        ]);
    }

    /**
     * The version a meta-package carries, which the install marker records
     *
     * @param string $content
     * @return string
     */
    public function version(string $content): string
    {
        return (string) ($this->serializer->unserialize($content)['version'] ?? '');
    }

    /**
     * What node_modules was installed for: the meta-package's version and the theme's own packages
     *
     * @param string $code
     * @param string $content
     * @return string
     */
    public function installKey(string $code, string $content): string
    {
        $own = $this->packages($this->manifest->themeBuildDir($code) . '/package.json');
        ksort($own);

        return $this->version($content) . '-' . substr(sha1($this->serializer->serialize($own)), 0, 12);
    }

    /**
     * The package names a meta-package depends on
     *
     * @param string $content
     * @return string[]
     */
    public function names(string $content): array
    {
        return array_keys((array) ($this->serializer->unserialize($content)['dependencies'] ?? []));
    }

    /**
     * Add one source's packages, refusing a package two sources pin differently
     *
     * @param array<string,string> $packages
     * @param string $source
     * @param array<string,string> $dependencies
     * @param array<string,string[]> $owners
     * @return void
     * @throws \RuntimeException
     */
    private function collect(array $packages, string $source, array &$dependencies, array &$owners): void
    {
        foreach ($packages as $name => $version) {
            if (isset($dependencies[$name]) && $dependencies[$name] !== $version) {
                throw new \RuntimeException(\sprintf(
                    '"%s" is %s in %s but %s in %s. Use one version.',
                    $name,
                    $dependencies[$name],
                    implode(', ', $owners[$name]),
                    $version,
                    $source
                ));
            }
            $dependencies[$name] = $version;
            $owners[$name][] = $source;
        }
    }

    /**
     * The dependencies and devDependencies of a package.json
     *
     * @param string $file
     * @return array<string,string>
     */
    private function packages(string $file): array
    {
        if (!$this->fileDriver->isFile($file)) {
            return [];
        }

        $json = $this->serializer->unserialize($this->fileDriver->fileGetContents($file));

        return array_map('strval', [...($json['dependencies'] ?? []), ...($json['devDependencies'] ?? [])]);
    }

    /**
     * The path from one directory to another, forward slashes
     *
     * @param string $from
     * @param string $to
     * @return string
     */
    private function relativePath(string $from, string $to): string
    {
        $fromParts = explode('/', trim($from, '/'));
        $toParts = explode('/', trim($to, '/'));
        while ($fromParts && $toParts && $fromParts[0] === $toParts[0]) {
            array_shift($fromParts);
            array_shift($toParts);
        }

        return implode('/', [...array_fill(0, \count($fromParts), '..'), ...$toParts]) ?: '.';
    }

    /**
     * A path as messages show it: from the project root
     *
     * @param string $path
     * @return string
     */
    private function display(string $path): string
    {
        return $this->manifest->relative($path) ?? $path;
    }

    /**
     * JSON as npm writes it: two-space indent, slashes and Unicode as they are
     *
     * @param array $data
     * @return string
     */
    private function encode(array $data): string
    {
        $json = (string) json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return preg_replace_callback(
            '/^ +/m',
            static fn (array $match): string => str_repeat(' ', (int) (\strlen($match[0]) / 2)),
            $json
        ) . "\n";
    }
}
