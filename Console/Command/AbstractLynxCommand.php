<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Console\Command;

use Magento\Framework\Filesystem\Driver\File as FileDriver;
use OOCS\LynxComponent\Helper\Schema\Extensions;
use OOCS\LynxComponent\Helper\Schema\TypeScript;
use OOCS\LynxTheme\Helper\BuildManifest;
use OOCS\LynxTheme\Helper\ThemeDependencies;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Process\Process;

/**
 * Theme selection, --list, npm, props.d.ts and extensions.json for the lynx:theme:setup and lynx:static:* commands
 */
abstract class AbstractLynxCommand extends Command
{
    protected const ARGUMENT_THEME = 'theme';

    protected const OPTION_LIST = 'list';

    protected const OPTION_NPM = 'npm';

    /** Read when --npm is absent, so a deploy script sets the binary once. */
    private const ENV_NPM = 'LYNX_NPM';

    /**
     * Manifest, meta-packages, component props types, container blocks and event observers, file driver, name
     *
     * @param BuildManifest $manifest
     * @param ThemeDependencies $dependencies
     * @param TypeScript $typeScript
     * @param Extensions $extensions
     * @param FileDriver $fileDriver
     * @param string|null $name
     */
    public function __construct(
        protected readonly BuildManifest $manifest,
        protected readonly ThemeDependencies $dependencies,
        private readonly TypeScript $typeScript,
        private readonly Extensions $extensions,
        protected readonly FileDriver $fileDriver,
        ?string $name = null,
    ) {
        parent::__construct($name);
    }

    /**
     * The theme argument, --list and --npm
     *
     * @param string $themeHelp
     * @return $this
     */
    protected function addThemeInput(string $themeHelp): self
    {
        return $this->addArgument(
            self::ARGUMENT_THEME,
            InputArgument::IS_ARRAY | InputArgument::OPTIONAL,
            $themeHelp
        )
            ->addOption(
                self::OPTION_LIST,
                null,
                InputOption::VALUE_NONE,
                'List the Lynx themes this installation has and stop'
            )
            ->addOption(
                self::OPTION_NPM,
                null,
                InputOption::VALUE_REQUIRED,
                'The npm binary to run, e.g. npm12 or /usr/bin/npm12. Defaults to ' . self::ENV_NPM
                . ', then npm on PATH'
            );
    }

    /**
     * The themes typed, else those lynx:theme:setup has set up; null after printing why there are none
     *
     * @param InputInterface $input
     * @param OutputInterface $output
     * @return string[]|null
     */
    protected function themes(InputInterface $input, OutputInterface $output): ?array
    {
        $requested = (array) $input->getArgument(self::ARGUMENT_THEME);
        if ($requested !== []) {
            return $this->select($requested, $output);
        }

        $themes = $this->manifest->selectedThemes();
        if ($themes === []) {
            $output->writeln('<error>Name the themes, e.g. OOCS_LynxVue.</error>');
            $this->listThemes($output);

            return null;
        }

        return $themes;
    }

    /**
     * The npm binary: --npm, then LYNX_NPM, then npm on PATH
     *
     * @param InputInterface $input
     * @param OutputInterface $output
     * @return string
     */
    protected function npm(InputInterface $input, OutputInterface $output): string
    {
        // phpcs:ignore Magento2.Functions.DiscouragedFunction
        $npm = $input->getOption(self::OPTION_NPM) ?: (getenv(self::ENV_NPM) ?: 'npm');
        if ($output->isVerbose()) {
            $output->writeln(\sprintf('npm = <info>%s</info>', $npm));
        }

        return $npm;
    }

    /**
     * Run npm and pass its output straight through
     *
     * @param OutputInterface $output
     * @param string $npm
     * @param string[] $arguments
     * @param string $cwd
     * @param array<string,string> $env added to the inherited environment
     * @return bool
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    protected function runNpm(
        OutputInterface $output,
        string $npm,
        array $arguments,
        string $cwd,
        array $env = []
    ): bool {
        $output->writeln(\sprintf(
            '<comment>%s %s</comment>  (%s)',
            $npm,
            implode(' ', $arguments),
            str_replace(BP . '/', '', $cwd)
        ));

        $process = new Process([$npm, ...$arguments], $cwd, $env ?: null);
        $process->setTimeout(null);

        try {
            $process->run(static function (string $type, string $buffer) use ($output): void {
                $output->write($buffer);
            });
        } catch (\Throwable $e) {
            $output->writeln(\sprintf('<error>%s</error>', $e->getMessage()));

            return false;
        }

        if (!$process->isSuccessful()) {
            $output->writeln(\sprintf('<error>%s exited with %d.</error>', $npm, (int) $process->getExitCode()));

            return false;
        }

        return true;
    }

    /**
     * Print the Lynx themes, marking those set up
     *
     * @param OutputInterface $output
     * @param int $exit
     * @return int
     */
    protected function listThemes(OutputInterface $output, int $exit = Command::SUCCESS): int
    {
        $lynx = $this->manifest->lynxThemes();

        if ($lynx === []) {
            $output->writeln(
                '<comment>No registered theme has a ' . BuildManifest::THEME_DIR
                . '/package.json to build from.</comment>'
            );

            return $exit;
        }

        $selected = $this->manifest->selectedThemes();

        $output->writeln('Lynx themes, by the name to type:');

        foreach ($lynx as $code => $dir) {
            $output->writeln(\sprintf(
                '  %s %-22s %-30s %s',
                \in_array($code, $selected, true) ? '<info>*</info>' : ' ',
                $this->manifest->shortName($code),
                $code,
                $this->manifest->relative($dir) ?? $dir
            ));
        }

        $output->writeln('');
        $output->writeln('<info>*</info> = set up by lynx:theme:setup.');

        return $exit;
    }

    /**
     * Write each theme's lynx/dist/props.d.ts from etc/components/*.graphqls, which type-check and Vue's compiler read
     *
     * @param string[] $themes
     * @param OutputInterface $output
     * @return void
     */
    protected function writePropsTypes(array $themes, OutputInterface $output): void
    {
        $content = $this->typeScript->generate();

        $dirs = [];
        foreach ($themes as $code) {
            $dir = $this->manifest->themeBuildDir($code) . '/dist';
            $this->fileDriver->createDirectory($dir);
            $this->fileDriver->filePutContents($dir . '/props.d.ts', $content);
            $dirs[] = str_replace(BP . '/', '', $dir);
        }

        $output->writeln(\sprintf('<info>props.d.ts</info> written to %s', implode(', ', $dirs)));
    }

    /**
     * Write each theme's lynx/dist/extensions.json: the blocks and observers virtual:lynx-extensions serves
     *
     * @param string[] $themes
     * @param OutputInterface $output
     * @return void
     */
    protected function writeExtensions(array $themes, OutputInterface $output): void
    {
        $content = $this->extensions->generate();

        $dirs = [];
        foreach ($themes as $code) {
            $dir = $this->manifest->themeBuildDir($code) . '/dist';
            $this->fileDriver->createDirectory($dir);
            $this->fileDriver->filePutContents($dir . '/extensions.json', $content);
            $dirs[] = str_replace(BP . '/', '', $dir);
        }

        $output->writeln(\sprintf('<info>extensions.json</info> written to %s', implode(', ', $dirs)));
    }

    /**
     * Whether every theme's meta-package and node_modules match the enabled modules and the kit
     *
     * @param string[] $themes
     * @param OutputInterface $output
     * @return bool
     */
    protected function areSetUp(array $themes, OutputInterface $output): bool
    {
        $stale = [];
        foreach ($themes as $code) {
            $dir = $this->manifest->themeBuildDir($code);
            try {
                $expected = $this->dependencies->generate($code);
            } catch (\RuntimeException $e) {
                $output->writeln(\sprintf('<error>%s: %s</error>', $code, $e->getMessage()));

                return false;
            }

            $meta = $dir . '/' . BuildManifest::META_FILE;
            $installed = $dir . '/' . BuildManifest::INSTALLED_FILE;
            if (!$this->fileDriver->isFile($meta) || $this->fileDriver->fileGetContents($meta) !== $expected
                || !$this->fileDriver->isFile($installed)
                || trim($this->fileDriver->fileGetContents($installed))
                    !== $this->dependencies->installKey($code, $expected)
            ) {
                $stale[] = $this->manifest->shortName($code);
            }
        }

        if ($stale === []) {
            return true;
        }

        $output->writeln(\sprintf(
            '<error>Not set up for the enabled modules and the kit: %s. Run bin/magento lynx:theme:setup %s</error>',
            implode(', ', $stale),
            implode(' ', $stale)
        ));

        return false;
    }

    /**
     * Resolve what was typed to theme codes, or null when any of it does not answer
     *
     * @param string[] $requested
     * @param OutputInterface $output
     * @return string[]|null
     */
    private function select(array $requested, OutputInterface $output): ?array
    {
        $themes = $this->manifest->frontendThemes();
        $selected = [];
        $failed = false;

        foreach ($requested as $name) {
            $code = $this->manifest->resolve($name);

            if ($code === null) {
                $output->writeln(\sprintf('<error>No Lynx theme is named %s.</error>', $name));
                $failed = true;

                continue;
            }

            if (!$this->manifest->isLynxTheme($themes[$code])) {
                $output->writeln(\sprintf(
                    '<error>%s is not a Lynx theme: it has no %s/package.json to build from.</error>',
                    $code,
                    BuildManifest::THEME_DIR
                ));
                $failed = true;

                continue;
            }

            $selected[] = $code;
        }

        if ($failed) {
            $output->writeln('Run with <info>--list</info> to see the Lynx themes this installation has.');

            return null;
        }

        $selected = array_values(array_unique($selected));
        sort($selected);

        return $selected;
    }
}
