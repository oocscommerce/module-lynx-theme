<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Console\Command;

use Magento\Framework\Filesystem\Driver\File as FileDriver;
use OOCS\LynxTheme\Helper\BuildManifest;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Writes a child theme of a Lynx theme under app/design/frontend, its build root copied from the parent's
 */
class ThemeCreate extends Command
{
    private const ARGUMENT_THEME = 'theme';

    private const OPTION_PARENT = 'parent';

    private const DEFAULT_PARENT = 'OOCS_LynxVue';

    private const AREA = 'frontend/';

    /**
     * The parent's build root files a theme starts from; its flat src/ beyond the entries stays inherited
     */
    private const BUILD_FILES = [
        'package.json',
        'vite.config.js',
        'eslint.config.mjs',
        'tsconfig.json',
        '.gitignore',
        'wrangler.toml',
        'src/main.ts',
        'src/ssr.ts',
        'src/ssr-worker.ts',
        'src/styles.css',
    ];

    /**
     * Manifest, file driver, name
     *
     * @param BuildManifest $manifest
     * @param FileDriver $fileDriver
     * @param string|null $name
     */
    public function __construct(
        private readonly BuildManifest $manifest,
        private readonly FileDriver $fileDriver,
        ?string $name = null,
    ) {
        parent::__construct($name);
    }

    /**
     * Name, description and input
     *
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('lynx:theme:create')
            ->setDescription('Create a child theme of a Lynx theme under app/design/frontend')
            ->addArgument(self::ARGUMENT_THEME, InputArgument::REQUIRED, 'The new theme, e.g. Acme_Shop')
            ->addOption(
                self::OPTION_PARENT,
                null,
                InputOption::VALUE_REQUIRED,
                'The Lynx theme it inherits from',
                self::DEFAULT_PARENT
            );

        parent::configure();
    }

    /**
     * Check the names, then write the theme
     *
     * @param InputInterface $input
     * @param OutputInterface $output
     * @return int
     */
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $name = (string) $input->getArgument(self::ARGUMENT_THEME);
        if (!preg_match('/^([A-Za-z0-9]+)_([A-Za-z0-9_]+)$/', $name, $parts)) {
            $output->writeln(\sprintf('<error>%s: write the theme as Vendor_Name, e.g. Acme_Shop.</error>', $name));

            return Command::FAILURE;
        }

        $parentName = (string) $input->getOption(self::OPTION_PARENT);
        $parent = $this->manifest->resolve($parentName);
        $parentDir = (string) ($this->manifest->frontendThemes()[(string) $parent] ?? '');
        if ($parent === null || !$this->manifest->isLynxTheme($parentDir)) {
            $output->writeln(\sprintf(
                '<error>%s is not a Lynx theme: it has no %s/package.json to start from.</error>',
                $parentName,
                BuildManifest::THEME_DIR
            ));

            return Command::FAILURE;
        }

        $dir = $this->manifest->root() . '/app/design/frontend/' . $parts[1] . '/' . $parts[2];
        if ($this->manifest->resolve($name) !== null || $this->fileDriver->isExists($dir)) {
            $output->writeln(\sprintf('<error>%s already exists.</error>', $name));

            return Command::FAILURE;
        }

        $this->write($dir, $parts[1] . '/' . $parts[2], $parentDir, substr($parent, \strlen(self::AREA)));

        $output->writeln(\sprintf('Created <info>%s</info>. Then run:', $this->manifest->relative($dir)));
        $output->writeln('  bin/magento setup:upgrade');
        $output->writeln(\sprintf('  bin/magento lynx:theme:setup %s', $name));
        $output->writeln(\sprintf('  bin/magento lynx:static:deploy %s', $name));
        $output->writeln('and choose it in Content > Design > Configuration.');

        return Command::SUCCESS;
    }

    /**
     * Registration, theme.xml, web/.gitignore and the build root
     *
     * @param string $dir
     * @param string $path Vendor/Name
     * @param string $parentDir
     * @param string $parentPath Vendor/Name of the parent
     * @return void
     */
    private function write(string $dir, string $path, string $parentDir, string $parentPath): void
    {
        $this->put($dir . '/registration.php', <<<PHP
            <?php
            declare(strict_types=1);

            use Magento\Framework\Component\ComponentRegistrar;

            ComponentRegistrar::register(ComponentRegistrar::THEME, 'frontend/{$path}', __DIR__);

            PHP);

        $title = str_replace('/', ' ', $path);
        $this->put($dir . '/theme.xml', <<<XML
            <?xml version="1.0"?>
            <theme xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:noNamespaceSchemaLocation="urn:magento:framework:Config/etc/theme.xsd">
                <title>{$title}</title>
                <parent>{$parentPath}</parent>
            </theme>

            XML);

        $files = ['web/.gitignore'];
        foreach (self::BUILD_FILES as $file) {
            $files[] = BuildManifest::THEME_DIR . '/' . $file;
        }

        foreach ($files as $file) {
            if ($this->fileDriver->isFile($parentDir . '/' . $file)) {
                $this->put($dir . '/' . $file, $this->fileDriver->fileGetContents($parentDir . '/' . $file));
            }
        }
    }

    /**
     * Write a file, creating its directory
     *
     * @param string $file
     * @param string $content
     * @return void
     */
    private function put(string $file, string $content): void
    {
        $this->fileDriver->createDirectory($this->fileDriver->getParentDirectory($file));
        $this->fileDriver->filePutContents($file, $content);
    }
}
