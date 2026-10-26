<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Console\Command;

use Magento\Framework\App\State;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use OOCS\LynxComponent\Helper\Schema\Extensions;
use OOCS\LynxComponent\Helper\Schema\TypeScript;
use OOCS\LynxTheme\Helper\BuildManifest;
use OOCS\LynxTheme\Helper\ThemeDependencies;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Builds the Lynx frontend assets of the themes set up by lynx:theme:setup
 */
class StaticDeploy extends AbstractLynxCommand
{
    private const OPTION_SSR = 'ssr';

    /**
     * App state, and the base command's dependencies
     *
     * @param State $appState
     * @param BuildManifest $manifest
     * @param ThemeDependencies $dependencies
     * @param TypeScript $typeScript
     * @param Extensions $extensions
     * @param FileDriver $fileDriver
     * @param string|null $name
     */
    public function __construct(
        private readonly State $appState,
        BuildManifest $manifest,
        ThemeDependencies $dependencies,
        TypeScript $typeScript,
        Extensions $extensions,
        FileDriver $fileDriver,
        ?string $name = null,
    ) {
        parent::__construct($manifest, $dependencies, $typeScript, $extensions, $fileDriver, $name);
    }

    /**
     * Name, description and input
     *
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('lynx:static:deploy')
            ->setDescription('Build the Lynx frontend assets of the themes set up by lynx:theme:setup')
            ->addThemeInput('Themes to build, e.g. OOCS_LynxVue; none: every theme set up')
            ->addOption(
                self::OPTION_SSR,
                null,
                InputOption::VALUE_NONE,
                'Build the SSR bundle as well as the client one'
            );

        parent::configure();
    }

    /**
     * Run the client build, and the SSR one when asked, in every theme's build root
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
        if ($themes === null || !$this->areSetUp($themes, $output)) {
            return Command::FAILURE;
        }

        $this->writePropsTypes($themes, $output);
        $this->writeExtensions($themes, $output);

        if (!$this->build($themes, $this->npm($input, $output), (bool) $input->getOption(self::OPTION_SSR), $output)) {
            return Command::FAILURE;
        }

        $output->writeln(\sprintf('<info>Built %d theme(s).</info>', \count($themes)));
        // Other modes serve web/ through static file fallback
        if ($this->appState->getMode() === State::MODE_PRODUCTION) {
            $output->writeln('Run <info>setup:static-content:deploy</info> to publish them to pub/static.');
        }

        return Command::SUCCESS;
    }

    /**
     * Run the client build, and the SSR one when asked, in each theme's build root; false on the first failure
     *
     * @param string[] $themes
     * @param string $npm
     * @param bool $ssr
     * @param OutputInterface $output
     * @return bool
     */
    private function build(array $themes, string $npm, bool $ssr, OutputInterface $output): bool
    {
        // -v: full npm and Vite output
        $verbose = $output->isVerbose();
        $run = $verbose ? ['run'] : ['run', '--silent'];
        $env = $verbose ? ['LYNX_BUILD_VERBOSE' => '1'] : [];

        foreach ($themes as $code) {
            $dir = (string) $this->manifest->themeBuildDir($code);
            if (!$this->runNpm($output, $npm, [...$run, 'build'], $dir, $env)
                || ($ssr && !$this->runNpm($output, $npm, [...$run, 'build:ssr'], $dir, $env))
            ) {
                return false;
            }
        }

        return true;
    }
}
