<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Helper;

use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Filesystem\DirectoryList;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Serialize\Serializer\Json;
use OOCS\LynxTheme\Helper\BuildManifest;
use PHPUnit\Framework\TestCase;

/**
 * The Lynx themes and the enabled modules, on a project tree made in a temporary folder
 */
class BuildManifestTest extends TestCase
{
    /**
     * The temporary project root
     *
     * @var string
     */
    private string $root;

    /**
     * @var FileDriver
     */
    private FileDriver $driver;

    /**
     * @var BuildManifest
     */
    private BuildManifest $manifest;

    /**
     * A project with Blank, Vue (child of Blank), a child of Vue, Luma and a theme whose parent loops back
     *
     * @return void
     */
    protected function setUp(): void
    {
        $this->driver = new FileDriver();
        $this->root = sys_get_temp_dir() . '/lynx-manifest-' . uniqid();
        $themes = [
            'frontend/OOCS/LynxBlank' => [null, true],
            'frontend/OOCS/LynxVue'   => ['OOCS/LynxBlank', true],
            'frontend/Vendor/shop'    => ['OOCS/LynxVue', true],
            'frontend/Magento/luma'   => ['Magento/blank', false],
            'frontend/Loop/a'         => ['Loop/b', false],
            'frontend/Loop/b'         => ['Loop/a', false],
        ];
        $paths = [];
        foreach ($themes as $code => [$parent, $lynx]) {
            $dir = $this->root . '/app/design/' . $code;
            $this->driver->createDirectory($dir . '/lynx');
            $this->driver->filePutContents(
                $dir . '/theme.xml',
                '<theme>' . ($parent ? '<parent>' . $parent . '</parent>' : '') . '</theme>'
            );
            if ($lynx) {
                $this->driver->filePutContents($dir . '/lynx/package.json', '{}');
            }
            $paths[$code] = $dir;
        }
        $paths['adminhtml/Magento/backend'] = $this->root . '/admin';

        $registrar = $this->createMock(ComponentRegistrarInterface::class);
        $registrar->method('getPaths')->willReturnMap([
            [ComponentRegistrar::THEME, $paths],
            [ComponentRegistrar::MODULE, ['OOCS_LynxTheme' => '/m/theme', 'Disabled_One' => '/m/off']],
        ]);
        $moduleList = $this->createMock(ModuleListInterface::class);
        $moduleList->method('getNames')->willReturn(['OOCS_LynxTheme', 'Not_Registered']);
        $directoryList = $this->createMock(DirectoryList::class);
        $directoryList->method('getRoot')->willReturn($this->root . '/');

        $this->manifest = new BuildManifest($registrar, $moduleList, $directoryList, $this->driver, new Json());
    }

    /**
     * Remove the temporary project
     *
     * @return void
     */
    protected function tearDown(): void
    {
        $this->driver->deleteDirectory($this->root);
    }

    /**
     * Set up = a meta-package in the build root
     *
     * @return void
     */
    public function testSelectedThemes(): void
    {
        $vue = $this->root . '/app/design/frontend/OOCS/LynxVue/lynx';
        $this->assertSame([], $this->manifest->selectedThemes());

        $this->driver->createDirectory($vue . '/.lynx');
        $this->driver->filePutContents($vue . '/' . BuildManifest::META_FILE, '{}');

        $this->assertSame(['frontend/OOCS/LynxVue'], $this->manifest->selectedThemes());
    }

    /**
     * Frontend themes only, sorted; Lynx themes are those with lynx/package.json
     *
     * @return void
     */
    public function testThemes(): void
    {
        $this->assertSame(
            ['frontend/Loop/a', 'frontend/Loop/b', 'frontend/Magento/luma', 'frontend/OOCS/LynxBlank',
                'frontend/OOCS/LynxVue', 'frontend/Vendor/shop'],
            array_keys($this->manifest->frontendThemes())
        );
        $this->assertSame(
            ['frontend/OOCS/LynxBlank', 'frontend/OOCS/LynxVue', 'frontend/Vendor/shop'],
            array_keys($this->manifest->lynxThemes())
        );
    }

    /**
     * The parent chain stops at a theme with no parent, an uninstalled parent or a loop
     *
     * @return void
     */
    public function testParentChain(): void
    {
        $this->assertSame(
            ['frontend/OOCS/LynxVue', 'frontend/OOCS/LynxBlank'],
            $this->manifest->parentChain('frontend/Vendor/shop')
        );
        $this->assertSame([], $this->manifest->parentChain('frontend/OOCS/LynxBlank'));
        $this->assertSame([], $this->manifest->parentChain('frontend/Magento/luma'));
        $this->assertSame(['frontend/Loop/b', 'frontend/Loop/a'], $this->manifest->parentChain('frontend/Loop/a'));
    }

    /**
     * Short names map both ways
     *
     * @return void
     */
    public function testShortNames(): void
    {
        $this->assertSame('OOCS_LynxVue', $this->manifest->shortName('frontend/OOCS/LynxVue'));
        $this->assertSame('frontend/Vendor/shop', $this->manifest->resolve('Vendor_shop'));
        $this->assertNull($this->manifest->resolve('Nope_theme'));
    }

    /**
     * Build dir, relative paths and enabled module paths
     *
     * @return void
     */
    public function testPaths(): void
    {
        $this->assertSame(
            $this->root . '/app/design/frontend/OOCS/LynxVue/lynx',
            $this->manifest->themeBuildDir('frontend/OOCS/LynxVue')
        );
        $this->assertNull($this->manifest->themeBuildDir('frontend/Nope/x'));
        $this->assertSame('app/design/x', $this->manifest->relative($this->root . '/app/design/x/'));
        $this->assertNull($this->manifest->relative('/elsewhere/x'));
        $this->assertSame(['OOCS_LynxTheme' => '/m/theme'], $this->manifest->enabledModulePaths());
    }
}
