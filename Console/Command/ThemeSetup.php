<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Console\Command;

use OOCS\LynxTheme\Helper\BuildManifest;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Process\Process;

/**
 * Writes each theme's meta-package (.lynx/package.json) from the kit and the enabled modules, then npm installs it
 * in the theme's build root; run again after a composer update or enabling or disabling a module
 */
class ThemeSetup extends AbstractLynxCommand
{
    /**
     * Name, description and input
     *
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('lynx:theme:setup')
            ->setDescription('Write the npm packages of the Lynx themes from the enabled modules, then npm install')
            ->addThemeInput('Themes to set up, e.g. OOCS_LynxVue; none: every theme set up before');

        parent::configure();
    }

    /**
     * Set up every theme; a failing theme does not stop the rest
     *
     * @param InputInterface $input
     * @param OutputInterface $output
     * @return int
     */
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if ($input->getOption(self::OPTION_LIST)) {
            return $this->listThemes($output);
        }

        $themes = $this->themes($input, $output);
        if ($themes === null) {
            return Command::FAILURE;
        }

        $this->writePropsTypes($themes, $output);
        $this->writeExtensions($themes, $output);

        $npm = $this->npm($input, $output);
        $failed = [];
        foreach ($themes as $code) {
            if (!$this->setUp($code, $npm, $output)) {
                $failed[] = $code;
            }
        }

        if ($failed !== []) {
            $output->writeln(\sprintf('<error>Not set up: %s.</error>', implode(', ', $failed)));

            return Command::FAILURE;
        }

        $output->writeln('Run <info>lynx:static:deploy</info> to build them.');

        return Command::SUCCESS;
    }

    /**
     * Write a theme's meta-package and install it when it changed or node_modules lacks it
     *
     * @param string $code
     * @param string $npm
     * @param OutputInterface $output
     * @return bool
     */
    private function setUp(string $code, string $npm, OutputInterface $output): bool
    {
        $dir = (string) $this->manifest->themeBuildDir($code);
        if (!$this->isWired($code, $dir, $output)) {
            return false;
        }

        try {
            $content = $this->dependencies->generate($code);
        } catch (\RuntimeException $e) {
            $output->writeln(\sprintf('<error>%s: %s</error>', $code, $e->getMessage()));

            return false;
        }

        $meta = $dir . '/' . BuildManifest::META_FILE;
        if (!$this->fileDriver->isFile($meta) || $this->fileDriver->fileGetContents($meta) !== $content) {
            $this->fileDriver->createDirectory($this->fileDriver->getParentDirectory($meta));
            $this->fileDriver->filePutContents($meta, $content);
        }

        $key = $this->dependencies->installKey($code, $content);
        $installed = $dir . '/' . BuildManifest::INSTALLED_FILE;
        if ($this->fileDriver->isFile($installed)
            && trim($this->fileDriver->fileGetContents($installed)) === $key
        ) {
            $output->writeln(\sprintf('%s: <info>up to date</info>', $this->manifest->shortName($code)));

            return true;
        }

        if (!$this->install($dir, $this->dependencies->names($content), $npm, $output)) {
            return false;
        }

        $this->fileDriver->filePutContents($installed, $key . "\n");

        return true;
    }

    /**
     * Npm install in the build root, once more from scratch when packages land nested
     *
     * @param string $dir
     * @param string[] $names
     * @param string $npm
     * @param OutputInterface $output
     * @return bool
     */
    private function install(string $dir, array $names, string $npm, OutputInterface $output): bool
    {
        if (!$this->runNpm($output, $npm, ['install'], $dir)) {
            return false;
        }

        // A stale lock can leave a package nested under another one, out of reach of the theme and the modules
        if ($this->nested($dir, $names) !== []) {
            $output->writeln('<comment>Some packages landed nested; installing again from scratch.</comment>');
            // Only ever a theme's build root
            if (!str_ends_with($dir, '/' . BuildManifest::THEME_DIR)
                || !$this->fileDriver->isFile($dir . '/package.json')
            ) {
                return false;
            }
            // rm unlinks node_modules/lynx-deps; a PHP recursive delete would empty the .lynx it points to
            (new Process(['rm', '-rf', '--', $dir . '/node_modules', $dir . '/package-lock.json']))->mustRun();
            if (!$this->runNpm($output, $npm, ['install'], $dir)) {
                return false;
            }
        }

        $nested = $this->nested($dir, $names);
        if ($nested !== []) {
            $output->writeln(\sprintf(
                '<error>Not in %s/node_modules: %s. Run npm explain <package> there to see what holds them.</error>',
                $this->manifest->relative($dir) ?? $dir,
                implode(', ', $nested)
            ));

            return false;
        }

        return true;
    }

    /**
     * Whether the theme's package.json has the meta-package as a workspace
     *
     * @param string $code
     * @param string $dir
     * @param OutputInterface $output
     * @return bool
     */
    private function isWired(string $code, string $dir, OutputInterface $output): bool
    {
        $path = $this->manifest->relative($dir) ?? $dir;
        $package = $this->manifest->themePackage($code);
        // A workspace's packages land in this node_modules; as a file: dependency npm may nest them under it
        if (!\in_array('.lynx', (array) ($package['workspaces'] ?? []), true)) {
            $output->writeln(\sprintf('<error>%s/package.json: add "workspaces": [".lynx"].</error>', $path));

            return false;
        }

        return true;
    }

    /**
     * The meta-package's packages missing from the top of the build root's node_modules
     *
     * @param string $dir
     * @param string[] $names
     * @return string[]
     */
    private function nested(string $dir, array $names): array
    {
        return array_values(array_filter(
            $names,
            fn (string $name): bool => !$this->fileDriver->isFile($dir . '/node_modules/' . $name . '/package.json')
        ));
    }
}
