<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Console\Command;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Runs the frontend tests of the themes set up by lynx:theme:setup
 */
class StaticTest extends AbstractLynxCommand
{
    /**
     * Name, description and input
     *
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('lynx:static:test')
            ->setDescription('Run the Lynx frontend tests of the themes set up by lynx:theme:setup')
            ->addThemeInput('Themes to test, e.g. OOCS_LynxVue; none: every theme set up');

        parent::configure();
    }

    /**
     * Run the tests in every theme's build root; a failing theme does not stop the rest
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

        $npm = $this->npm($input, $output);
        $failed = [];

        foreach ($themes as $code) {
            if (!$this->runNpm($output, $npm, ['run', 'test'], (string) $this->manifest->themeBuildDir($code))) {
                $failed[] = $code;
            }
        }

        if ($failed !== []) {
            $output->writeln(\sprintf('<error>Tests failed in: %s.</error>', implode(', ', $failed)));

            return Command::FAILURE;
        }

        $output->writeln(\sprintf('<info>Tests passed in %d theme(s).</info>', \count($themes)));

        return Command::SUCCESS;
    }
}
